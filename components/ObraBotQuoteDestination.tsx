'use client';

import Link from 'next/link';
import { useState } from 'react';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import type { LinkMode, LinkPreview, QuoteDestination } from '@/lib/obrabot/quote-destination';
import type { QuoteReview } from '@/lib/obrabot/quotes';

type Option = { id: string; nombre: string; direccion: string | null };
const input = 'mt-1 w-full rounded-lg border border-kraft-200 bg-transparent p-2';
const button = 'rounded-lg border border-kraft-200 px-3 py-2 font-medium disabled:opacity-50';
const primary = 'rounded-lg bg-[#FF6A00] px-3 py-2 font-semibold text-[#141A23] disabled:opacity-50';
const money = (amount: number) => `$${amount.toLocaleString('es-CL')}`;

export function ObraBotQuoteDestination({ quote }: { quote: QuoteReview }) {
  const [kind, setKind] = useState<'crear' | 'vincular' | null>(null);
  const [clientKind, setClientKind] = useState<'existente' | 'nuevo'>('existente');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [mode, setMode] = useState<LinkMode | ''>('');
  const [saved, setSaved] = useState<QuoteDestination | null>(null);
  const result = saved ?? quote.destino;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const endpoint = `/api/obrabot/cotizaciones/${quote.id}/destino`;
  async function request(params?: URLSearchParams, body?: Record<string, unknown>) {
    const response = await fetch(params ? `${endpoint}?${params}` : endpoint, {
      method: body ? 'POST' : 'GET', headers: await aiHeaders(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'OBRABOT_DESTINATION_STALE') { setPreview(null); setMode(''); }
      throw new Error(data.error || 'No se pudo completar el vínculo.');
    }
    if (data.modo) {
      setSaved(data);
      if (body) {
        const refresh = await dataService.pullFromCloudServer().catch(() => null);
        if (!refresh?.success) setError('Guardé el vínculo. Actualiza la página para cargar los datos de la obra.');
      }
    }
    return data;
  }

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await task(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar el vínculo.'); }
    finally { setBusy(false); }
  }

  async function search(type: 'obras' | 'clientes', name = '') {
    setSelected('');
    setPreview(null);
    setMode('');
    const data = await request(new URLSearchParams({ tipo: type, q: name }));
    setOptions(data.opciones || []);
  }

  function open(next: 'crear' | 'vincular') {
    setKind(next);
    setQuery('');
    setClientKind('existente');
    void run(() => search(next === 'crear' ? 'clientes' : 'obras'));
  }

  if (result) return <div className="mt-2 space-y-1 break-words text-sm" role="status">
    <p>{result.modo === 'crear' ? 'Obra creada' : 'Cotización vinculada'} · {result.obra}</p>
    <Link className="font-medium underline" href={`/proyectos/${encodeURIComponent(result.proyecto_id)}/presupuestos`}>Ver obra</Link>
    {result.modo === 'crear' && !quote.destino && <p>Pendiente de programar las fechas de la obra.</p>}
    {result.equipo.length > 0 && <p>Equipo asignado · {result.equipo.join(', ')}</p>}
    {result.equipo_pendiente.length > 0 && <p>Por aclarar · {result.equipo_pendiente.join(', ')}</p>}
    {error && <p>{error}</p>}
    {result.modo === 'crear' && !result.equipo.length && !result.equipo_pendiente.length &&
      <p>¿Quieres asignar trabajadores o un jefe de obra? Abre la obra y selecciona Cuadrilla.</p>}
  </div>;

  const isProject = kind === 'vincular';
  const picker = (isProject || clientKind === 'existente') && <div className="space-y-2">
    <label className="block">{isProject ? 'Buscar obra' : 'Buscar cliente'}
      <input className={input} maxLength={150} value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <button type="button" disabled={busy} className={button} onClick={() => void run(() => search(isProject ? 'obras' : 'clientes', query))}>Buscar</button>
    <label className="block">{isProject ? 'Obra existente' : 'Cliente existente'}
      <select className={input} required value={selected} onChange={event => { setSelected(event.target.value); setPreview(null); setMode(''); }}>
        <option value="">{options.length ? 'Selecciona una opción' : 'Sin resultados'}</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.nombre}{item.direccion ? ` · ${item.direccion}` : ` · ${item.id}`}</option>)}
      </select>
    </label>
  </div>;

  return <div className="mt-2 space-y-3 text-sm">
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={kind === 'crear'} disabled={busy} className={kind === 'crear' ? primary : button} onClick={() => open('crear')}>Crear obra</button>
      <button type="button" aria-pressed={kind === 'vincular'} disabled={busy} className={kind === 'vincular' ? primary : button} onClick={() => open('vincular')}>Vincular a obra</button>
    </div>
    {kind === 'crear' && <form className="space-y-3 rounded-lg border border-kraft-200 p-3" onSubmit={event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const equipo = String(values.equipo || '').split(/[,;]/).map(name => name.trim()).filter(Boolean);
      void run(() => request(undefined, { ...values, modo: 'crear', cliente: clientKind === 'existente' ? selected : values.cliente, equipo }));
    }}>
      <label className="block">Nombre de la obra<input name="nombre" required maxLength={150} className={input} defaultValue={quote.borrador.titulo_proyecto} /></label>
      <label className="block">Dirección<input name="direccion" required maxLength={300} className={input} /></label>
      <label className="block">Cliente
        <select className={input} value={clientKind} onChange={event => setClientKind(event.target.value === 'nuevo' ? 'nuevo' : 'existente')}>
          <option value="existente">Usar cliente existente</option><option value="nuevo">Registrar cliente nuevo</option>
        </select>
      </label>
      {picker}
      {clientKind === 'nuevo' && <>
        <label className="block">Nombre del cliente<input name="cliente" required maxLength={150} className={input} /></label>
        <label className="block">Teléfono<input name="telefono" type="tel" required className={input} /></label>
        <label className="block">Correo electrónico<input name="correo" type="email" required maxLength={100} className={input} /></label>
      </>}
      <label className="block">Equipo (opcional)<input name="equipo" className={input} placeholder="Nombres completos separados por comas" /></label>
      <p>Presupuesto principal · {money(quote.borrador.estructura_financiera.precio_total_con_iva)} con IVA.</p>
      <button type="submit" disabled={busy} className={primary}>Confirmar creación</button>
    </form>}
    {isProject && <div className="space-y-3 rounded-lg border border-kraft-200 p-3">
      {picker}
      <button type="button" className={button} disabled={busy || !selected} onClick={() => void run(async () => {
        const data = await request(new URLSearchParams({ proyecto: selected }));
        if (!data.modo) { setPreview(data); setMode(data.tiene_presupuesto ? '' : 'principal'); }
      })}>Revisar vínculo</button>
      {preview && <form className="space-y-2 border-t border-kraft-200 pt-3" onSubmit={event => {
        event.preventDefault();
        void run(() => request(undefined, { modo: mode, proyecto: preview.proyecto_id, version: preview.version, cabecera: preview.cabecera }));
      }}>
        <p className="font-semibold">{preview.obra}</p>
        <p>Cotización · {money(preview.monto_cotizacion)} con IVA.</p>
        {preview.tiene_presupuesto ? <>
          <p>Presupuesto actual · {money(preview.monto_anterior)}.</p>
          <label className="block">Cómo aplicar la cotización
            <select required className={input} value={mode} onChange={event => setMode(event.target.value as LinkMode)}>
              <option value="">Selecciona una opción</option>
              <option value="adjuntar">Solo adjuntar · {money(preview.monto_anterior)}</option>
              {preview.monto_reemplazo !== null && <option value="reemplazar">Reemplazar principal · {money(preview.monto_reemplazo)}</option>}
              <option value="adicional">Sumar como adicional · {money(preview.monto_adicional)}</option>
            </select>
          </label>
        </> : <p>La obra quedará con esta cotización como presupuesto principal.</p>}
        <button type="submit" className={primary} disabled={busy || !mode}>Confirmar vínculo</button>
      </form>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
