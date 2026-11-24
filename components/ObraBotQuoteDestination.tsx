'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Link2,
  Search,
  X,
} from 'lucide-react';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import type { LinkMode, LinkPreview, QuoteDestination } from '@/lib/obrabot/quote-destination';
import type { QuoteReview } from '@/lib/obrabot/quotes';

type Option = { id: string; nombre: string; direccion: string | null };

const inputCls =
  'mt-1 w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] px-3 py-2 text-xs sm:text-sm text-navy-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-obra-orange focus:outline-none focus:ring-2 focus:ring-obra-orange/15 transition-all';
const secondaryBtn =
  'inline-flex items-center gap-1.5 rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] hover:border-obra-orange px-3 py-2 text-xs font-semibold text-navy-900 dark:text-gray-200 transition-colors disabled:opacity-50';
const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-xl bg-obra-orange hover:bg-orange-600 px-4 py-2 text-xs font-heading font-bold text-white shadow-2xs transition-colors disabled:opacity-50';
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
      method: body ? 'POST' : 'GET',
      headers: await aiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'OBRABOT_DESTINATION_STALE') {
        setPreview(null);
        setMode('');
      }
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
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el vínculo.');
    } finally {
      setBusy(false);
    }
  }

  async function search(type: 'obras' | 'clientes', name = '') {
    setSelected('');
    setPreview(null);
    setMode('');
    const data = await request(new URLSearchParams({ tipo: type, q: name }));
    setOptions(data.opciones || []);
  }

  function open(next: 'crear' | 'vincular') {
    if (kind === next) {
      setKind(null);
      return;
    }
    setKind(next);
    setQuery('');
    setClientKind('existente');
    void run(() => search(next === 'crear' ? 'clientes' : 'obras'));
  }

  if (result) {
    return (
      <div
        role="status"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/25 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200"
      >
        <div className="space-y-0.5 min-w-0">
          <p className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">
              {result.modo === 'crear' ? 'Obra creada' : 'Vinculada a obra'} · {result.obra}
            </span>
          </p>
          {result.modo === 'crear' && !quote.destino && (
            <p className="text-[11px] opacity-85">Pendiente de programar fechas en la Carta Gantt.</p>
          )}
          {result.equipo.length > 0 && <p className="text-[11px] opacity-85">Equipo · {result.equipo.join(', ')}</p>}
          {result.equipo_pendiente.length > 0 && (
            <p className="text-[11px] opacity-85">Por aclarar · {result.equipo_pendiente.join(', ')}</p>
          )}
          {error && <p className="text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors shrink-0"
          href={`/proyectos/${encodeURIComponent(result.proyecto_id)}/presupuestos`}
        >
          <span>Ver obra</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  const isProject = kind === 'vincular';
  const picker = (isProject || clientKind === 'existente') && (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">
            {isProject ? 'Buscar obra' : 'Buscar cliente'}
          </span>
          <input
            className={inputCls}
            maxLength={150}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isProject ? 'Nombre de la obra…' : 'Nombre del cliente…'}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className={secondaryBtn}
          onClick={() => void run(() => search(isProject ? 'obras' : 'clientes', query))}
        >
          <Search className="w-3.5 h-3.5 text-obra-orange" />
          <span>Buscar</span>
        </button>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">
          {isProject ? 'Obra existente' : 'Cliente existente'}
        </span>
        <select
          className={inputCls}
          required
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setPreview(null);
            setMode('');
          }}
        >
          <option value="">{options.length ? 'Selecciona una opción' : 'Sin resultados'}</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
              {item.direccion ? ` · ${item.direccion}` : ` · ${item.id}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-kraft-100 dark:border-[#222B3A] space-y-3 text-xs sm:text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={kind === 'crear'}
          disabled={busy}
          onClick={() => open('crear')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
            kind === 'crear'
              ? 'bg-obra-orange text-white shadow-2xs'
              : 'border border-obra-orange/35 bg-orange-50/70 dark:bg-[#FF6A00]/10 text-obra-orange hover:bg-obra-orange hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Crear obra</span>
        </button>

        <button
          type="button"
          aria-pressed={kind === 'vincular'}
          disabled={busy}
          onClick={() => open('vincular')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
            kind === 'vincular'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Vincular a obra</span>
        </button>

        {kind && (
          <button
            type="button"
            onClick={() => setKind(null)}
            aria-label="Cerrar panel"
            className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {kind === 'crear' && (
        <form
          className="space-y-3 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-kraft-50/60 dark:bg-[#0F141C] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget));
            const equipo = String(values.equipo || '')
              .split(/[,;]/)
              .map((name) => name.trim())
              .filter(Boolean);
            void run(() =>
              request(undefined, {
                ...values,
                modo: 'crear',
                cliente: clientKind === 'existente' ? selected : values.cliente,
                equipo,
              }),
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Nombre de la obra</span>
              <input name="nombre" required maxLength={150} className={inputCls} defaultValue={quote.borrador.titulo_proyecto} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Dirección</span>
              <input name="direccion" required maxLength={300} className={inputCls} placeholder="Calle, número y comuna" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Cliente</span>
            <select
              className={inputCls}
              value={clientKind}
              onChange={(event) => setClientKind(event.target.value === 'nuevo' ? 'nuevo' : 'existente')}
            >
              <option value="existente">Usar cliente existente</option>
              <option value="nuevo">Registrar cliente nuevo</option>
            </select>
          </label>

          {picker}

          {clientKind === 'nuevo' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Nombre del cliente</span>
                <input name="cliente" required maxLength={150} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Teléfono</span>
                <input name="telefono" type="tel" required className={inputCls} placeholder="+56 9 …" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Correo electrónico</span>
                <input name="correo" type="email" required maxLength={100} className={inputCls} />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Equipo (opcional)</span>
            <input name="equipo" className={inputCls} placeholder="Nombres completos separados por comas" />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-kraft-200/70 dark:border-[#263040]">
            <p className="text-xs font-mono font-bold text-navy-900 dark:text-gray-200">
              Presupuesto: <span className="text-obra-orange">{money(quote.borrador.estructura_financiera.precio_total_con_iva)}</span> (IVA inc.)
            </p>
            <button type="submit" disabled={busy} className={primaryBtn}>
              Confirmar creación
            </button>
          </div>
        </form>
      )}

      {isProject && (
        <div className="space-y-3 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-kraft-50/60 dark:bg-[#0F141C] p-4">
          {picker}
          <button
            type="button"
            className={secondaryBtn}
            disabled={busy || !selected}
            onClick={() =>
              void run(async () => {
                const data = await request(new URLSearchParams({ proyecto: selected }));
                if (!data.modo) {
                  setPreview(data);
                  setMode(data.tiene_presupuesto ? '' : 'principal');
                }
              })
            }
          >
            Revisar vínculo
          </button>

          {preview && (
            <form
              className="space-y-3 border-t border-kraft-200 dark:border-[#263040] pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() =>
                  request(undefined, {
                    modo: mode,
                    proyecto: preview.proyecto_id,
                    version: preview.version,
                    cabecera: preview.cabecera,
                  }),
                );
              }}
            >
              <div className="rounded-xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] p-3 text-xs space-y-1">
                <p className="font-heading font-bold text-navy-900 dark:text-white">{preview.obra}</p>
                <p className="font-mono text-gray-600 dark:text-gray-300">
                  Cotización: <strong className="text-obra-orange">{money(preview.monto_cotizacion)}</strong> con IVA
                </p>
                {preview.tiene_presupuesto && (
                  <p className="font-mono text-gray-500 dark:text-gray-400">
                    Presupuesto actual: {money(preview.monto_anterior)}
                  </p>
                )}
              </div>

              {preview.tiene_presupuesto ? (
                <label className="block">
                  <span className="text-xs font-semibold text-navy-900 dark:text-gray-200">Cómo aplicar la cotización</span>
                  <select required className={inputCls} value={mode} onChange={(event) => setMode(event.target.value as LinkMode)}>
                    <option value="">Selecciona una opción</option>
                    <option value="adjuntar">Solo adjuntar · mantiene {money(preview.monto_anterior)}</option>
                    {preview.monto_reemplazo !== null && (
                      <option value="reemplazar">Reemplazar principal · nuevo total {money(preview.monto_reemplazo)}</option>
                    )}
                    <option value="adicional">Sumar como adicional · nuevo total {money(preview.monto_adicional)}</option>
                  </select>
                </label>
              ) : (
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  La obra quedará con esta cotización como presupuesto principal.
                </p>
              )}

              <button type="submit" className={primaryBtn} disabled={busy || !mode}>
                Confirmar vínculo
              </button>
            </form>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
