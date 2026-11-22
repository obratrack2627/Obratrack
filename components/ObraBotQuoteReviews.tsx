'use client';

import { useEffect, useRef, useState } from 'react';
import { ObraBotQuoteDestination } from './ObraBotQuoteDestination';
import { aiHeaders } from '@/lib/ai/client';
import type { QuoteReview, QuoteReply } from '@/lib/obrabot/quotes';

const endpoint = '/api/obrabot/cotizaciones';
const money = (amount: number) => `$${amount.toLocaleString('es-CL')}`;
const editorText = (row: QuoteReview) => (row.borrador.partidas_venta || []).map(line => [line.nombre, line.unidad, String(line.cantidad).replace('.', ','), line.precio_unitario].join(' | ')).join('\n');

export function ObraBotQuoteReviews() {
  const [rows, setRows] = useState<QuoteReview[]>([]);
  const [approved, setApproved] = useState<QuoteReview[]>([]);
  const [canLink, setCanLink] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [edit, setEdit] = useState<QuoteReview | null>(null);
  const [revisionItems, setRevisionItems] = useState('');
  const [note, setNote] = useState('');
  const [response, setResponse] = useState<QuoteReply | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submission = useRef<{ message: string; file?: File | null; id: string } | null>(null);

  async function load() {
    const res = await fetch(endpoint, { headers: await aiHeaders(), cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setRows(data.solicitudes);
    setApproved(data.aprobadas);
    setCanLink(data.permiteVincular);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await task(); } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la solicitud.'); }
    finally { setBusy(false); }
  }

  async function submit(message: string, source?: File | null) {
    const headers = await aiHeaders();
    const form = new FormData();
    form.set('mensaje', message);
    if (submission.current?.message !== message || submission.current?.file !== source) {
      submission.current = { message, file: source, id: crypto.randomUUID() };
    }
    form.set('solicitud', submission.current.id);
    if (source) form.set('archivo', source);
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: headers.Authorization }, body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    submission.current = null;
    setResponse(data);
    setEdit(null);
    await load();
  }

  async function download(id: string, format: 'pdf' | 'excel') {
    const response = await fetch(`${endpoint}/${id}?formato=${format}`, { headers: await aiHeaders() });
    if (!response.ok) throw new Error((await response.json()).error);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cotizacion_${id}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const button = 'rounded-lg border border-kraft-200 px-3 py-2 text-sm font-medium disabled:opacity-50';
  const input = 'w-full rounded-lg border border-kraft-200 bg-transparent p-2 text-sm';
  useEffect(() => {
    if (window.location.hash === '#cotizaciones-obrabot') {
      const details = document.getElementById('cotizaciones-obrabot') as HTMLDetailsElement | null;
      if (details) details.open = true;
    }
  }, []);

  return (
    <details id="cotizaciones-obrabot" className="rounded-xl border border-kraft-200 bg-white p-4 dark:bg-[#141A23]" onToggle={event => { if (event.currentTarget.open) void run(load); }}>
      <summary className="cursor-pointer font-semibold">Cotizaciones con precios ingresados</summary>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void run(() => submit(`Nueva cotización: ${title}\n${file ? '' : items}`, file)); }}>
        <label className="block text-sm">Nombre de la cotización<input required maxLength={150} className={input} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="block text-sm">Materiales y precios con IVA incluido<textarea rows={3} className={input} value={items} onChange={event => setItems(event.target.value)} placeholder="Cemento | saco | 2 | 5.990" /></label>
        <label className="block text-sm">O adjunta un Excel, un PDF o una foto del presupuesto<input type="file" accept=".xlsx,application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block max-w-full text-sm" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
        <button disabled={busy || (!items.trim() && !file)} className={button}>Preparar cotización</button>
      </form>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3"><strong>Pendientes de revisión</strong><button type="button" disabled={busy} className={button} onClick={() => void run(load)}>Actualizar</button></div>
        {rows.map(row => <details key={row.id} className="rounded-lg border border-kraft-200 p-3">
          <summary className="cursor-pointer break-words text-sm">{row.borrador.titulo_proyecto} · {money(row.borrador.estructura_financiera.precio_total_con_iva)} · revisión {row.revision}</summary>
          <ul className="my-3 max-h-56 space-y-1 overflow-auto text-sm">
            {(row.borrador.partidas_venta || []).map((line, i) => <li className="break-words" key={i}>{line.nombre} · {line.cantidad} {line.unidad} × {money(line.precio_unitario)} = {money(line.subtotal)}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={button} onClick={() => void run(() => submit(`aprueba cotización ${row.id} ${row.revision}`))}>Aprobar esta revisión</button>
            <button type="button" disabled={busy} className={button} onClick={() => { setEdit(row); setRevisionItems(editorText(row)); setNote(''); }}>Corregir o devolver</button>
          </div>
          {edit?.id === row.id && <div className="mt-3 space-y-2">
            <label className="block text-sm">Editar partidas<textarea rows={4} className={input} value={revisionItems} onChange={event => setRevisionItems(event.target.value)} /></label>
            <button type="button" disabled={busy || !revisionItems.trim()} className={button} onClick={() => void run(() => submit(`corrige cotización ${row.id} ${row.revision}\n${revisionItems}`))}>Guardar nueva revisión</button>
            <label className="block text-sm">Motivo para devolver<textarea rows={2} maxLength={1000} className={input} value={note} onChange={event => setNote(event.target.value)} /></label>
            <button type="button" disabled={busy || !note.trim()} className={button} onClick={() => void run(() => submit(`devuelve cotización ${row.id} ${row.revision} ${note}`))}>Devolver solicitud</button>
          </div>}
        </details>)}
      </div>
      {response && <p className="mt-3 text-sm" role="status">{response.archivo || !response.solicitud ? response.respuesta : 'Solicitud guardada. Revisa la bandeja para continuar.'}</p>}
      {approved.length > 0 && <div className="mt-4 space-y-2">
        <strong>Cotizaciones aprobadas</strong>
        {approved.map(row => <div key={row.id} className="rounded-lg border border-kraft-200 p-2 text-sm"><div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto break-words">{row.borrador.titulo_proyecto}</span>
          {(['pdf', 'excel'] as const).map(format => <button type="button" key={format} disabled={busy} className={button} onClick={() => void run(() => download(row.id, format))}>Descargar {format === 'pdf' ? 'PDF' : 'Excel'}</button>)}
        </div>{(canLink || row.destino) && <ObraBotQuoteDestination quote={row} />}</div>)}
      </div>}
      {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    </details>
  );
}
