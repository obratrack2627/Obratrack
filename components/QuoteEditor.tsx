'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  HardHat,
  Loader2,
  Package,
  Plus,
  Receipt,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import type { CotizacionEstimacion } from '@/types/database';
import type { Presupuesto } from '@/lib/presupuestos';
import { aiHeaders } from '@/lib/ai/client';
import { resolveSaleLineKind } from '@/lib/quotes/classify';
import { reviseQuote } from '@/lib/quotes/revise';
import { formatCLP, formatThousands, parseThousands } from '@/lib/utils';

const inputClass =
  'rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#0F141C] px-3 py-2 text-sm text-navy-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-obra-orange focus:ring-2 focus:ring-obra-orange/15 transition-all';

export default function QuoteEditor({
  id,
  initial,
  projectId,
  groupType = 'principal',
  embedded = false,
  onCancel,
  onSaved,
}: {
  id?: string;
  initial?: CotizacionEstimacion;
  projectId?: string;
  groupType?: 'principal' | 'complementario';
  embedded?: boolean;
  onCancel: () => void;
  onSaved: (row: Presupuesto) => void;
}) {
  const [row, setRow] = useState<Presupuesto | null>(null);
  const [draft, setDraft] = useState<CotizacionEstimacion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) {
      if (initial) setDraft(initial);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/presupuestos?id=' + encodeURIComponent(id), {
        headers: await aiHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el presupuesto.');
      const current: Presupuesto | undefined = data.presupuestos.find(
        (r: Presupuesto) => r.id === id || r.cotizacion.id === id,
      );
      if (!current) {
        throw new Error('La cotización no está disponible para editar. Actualiza el listado de presupuestos.');
      }
      setRow(current);
      setDraft({
        ...current.cotizacion,
        estructura_financiera: {
          ...current.cotizacion.estructura_financiera,
          tipo_utilidad: current.cotizacion.estructura_financiera.tipo_utilidad || 'recargo_costos',
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, initial]);

  let calculated: CotizacionEstimacion | null = null;
  let invalid = '';
  if ((row || initial) && draft) {
    try {
      calculated = reviseQuote(row?.cotizacion || initial!, draft);
    } catch (e) {
      invalid = (e as Error).message;
    }
  }

  const update = (changes: Partial<CotizacionEstimacion>) =>
    setDraft((d) => (d ? { ...d, ...changes } : d));

  const field = (
    label: string,
    key:
      | 'titulo_proyecto'
      | 'comuna_region'
      | 'cliente_nombre'
      | 'cliente_contacto'
      | 'cliente_email'
      | 'cliente_telefono'
      | 'fecha_validez',
    type = 'text',
    placeholder?: string,
  ) => (
    <label className="block space-y-1.5 text-xs font-semibold text-navy-900 dark:text-gray-200">
      <span>{label}</span>
      <input
        type={type}
        value={draft?.[key] || ''}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value })}
        className={`${inputClass} w-full`}
        maxLength={300}
      />
    </label>
  );

  const amountInput = (label: string, value: number, change: (v: number) => void, full = false) => (
    <input
      aria-label={label}
      inputMode="numeric"
      value={formatThousands(value)}
      onChange={(e) => change(parseThousands(e.target.value))}
      className={`${inputClass} ${full ? 'w-full' : 'w-32'} text-right font-mono font-semibold`}
    />
  );

  const numberInput = (
    label: string,
    value: number,
    change: (v: number) => void,
    integer = false,
    full = false,
  ) => (
    <input
      aria-label={label}
      type="number"
      min="0"
      step={integer ? '1' : 'any'}
      value={value}
      onChange={(e) => change(e.target.valueAsNumber || 0)}
      className={`${inputClass} ${full ? 'w-full' : 'w-24'} text-right font-mono`}
    />
  );

  const locked = !!(row?.grupo?.aplicado && row.grupo.seleccionado_id === row.id);
  const isAgreed = draft?.modo_presupuesto === 'precio_acordado';
  const hasCostDetails = (draft?.materiales.length || 0) > 0 || (draft?.mano_de_obra.length || 0) > 0;
  const hasExtraClientDetails = Boolean(
    draft?.cliente_contacto ||
      draft?.cliente_email ||
      draft?.cliente_telefono ||
      draft?.fecha_validez ||
      draft?.resumen_ejecutivo,
  );
  const hasNotesDetails = Boolean(draft?.observaciones || draft?.condiciones_pago);
  const milestonesPct = (draft?.hitos_pago || []).reduce((acc, h) => acc + (Number(h.porcentaje) || 0), 0);

  const materialsSection = draft && (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white flex items-center gap-2">
          <Package size={16} className="text-obra-orange" />
          <span>Materiales</span>
          <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
            Precios netos en CLP
          </span>
        </h3>
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
          {draft.materiales.length} {draft.materiales.length === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>
      {draft.materiales.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-kraft-200 dark:border-[#263040]">
          <table className="w-full text-sm text-left">
            <thead className="bg-kraft-50 dark:bg-[#0F141C] text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                {['Descripción', 'Unidad', 'Cantidad', 'Precio unitario', ''].map((h, i) => (
                  <th key={i} className="px-2.5 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kraft-100 dark:divide-[#222B3A]">
              {draft.materiales.map((m, index) => {
                const set = (change: Record<string, any>) =>
                  update({
                    materiales: draft.materiales.map((item, i) =>
                      i === index ? { ...item, ...change } : item,
                    ),
                  });
                return (
                  <tr key={index} className="bg-white dark:bg-[#141A23]">
                    <td className="p-1.5">
                      <input
                        aria-label={`Material ${index + 1}`}
                        value={m.nombre}
                        onChange={(e) => set({ nombre: e.target.value })}
                        maxLength={500}
                        placeholder="Nombre del material"
                        className={`${inputClass} min-w-44 w-full`}
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        aria-label={`Unidad material ${index + 1}`}
                        value={m.unidad}
                        onChange={(e) => set({ unidad: e.target.value })}
                        maxLength={30}
                        className={`${inputClass} w-20`}
                      />
                    </td>
                    <td className="p-1.5">
                      {numberInput(`Cantidad material ${index + 1}`, m.cantidad, (cantidad) => set({ cantidad }))}
                    </td>
                    <td className="p-1.5">
                      {amountInput(`Precio material ${index + 1}`, m.precio_unitario_estimado, (precio_unitario_estimado) =>
                        set({ precio_unitario_estimado, precio_original_con_iva: undefined }),
                      )}
                    </td>
                    <td className="p-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => update({ materiales: draft.materiales.filter((_, i) => i !== index) })}
                        aria-label={`Eliminar material ${index + 1}`}
                        className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          update({
            materiales: [
              ...draft.materiales,
              {
                nombre: '',
                unidad: 'un',
                cantidad: 1,
                precio_unitario_estimado: 0,
                subtotal: 0,
                categoria: 'general',
                mejor_tienda: 'Por cotizar',
                precio_mas_barato: 0,
                ahorro_estimado: 0,
              },
            ],
          })
        }
        className="text-xs font-heading font-bold text-obra-orange hover:text-orange-600 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-obra-orange/40 bg-orange-50/50 dark:bg-[#FF6A00]/5 px-3 py-2 transition-colors"
      >
        <Plus size={15} />
        <span>Agregar material</span>
      </button>
    </section>
  );

  const laborSection = draft && (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white flex items-center gap-2">
          <HardHat size={16} className="text-indigo-500" />
          <span>Mano de obra</span>
        </h3>
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
          {draft.mano_de_obra.length} {draft.mano_de_obra.length === 1 ? 'oficio' : 'oficios'}
        </span>
      </div>
      {draft.mano_de_obra.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-kraft-200 dark:border-[#263040]">
          <table className="w-full text-sm text-left">
            <thead className="bg-kraft-50 dark:bg-[#0F141C] text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                {['Oficio', 'Personas', 'Días', 'Jornal neto', ''].map((h, i) => (
                  <th key={i} className="px-2.5 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kraft-100 dark:divide-[#222B3A]">
              {draft.mano_de_obra.map((m, index) => {
                const set = (change: Record<string, any>) =>
                  update({
                    mano_de_obra: draft.mano_de_obra.map((item, i) =>
                      i === index ? { ...item, ...change } : item,
                    ),
                  });
                return (
                  <tr key={index} className="bg-white dark:bg-[#141A23]">
                    <td className="p-1.5">
                      <input
                        aria-label={`Oficio ${index + 1}`}
                        value={m.rol}
                        onChange={(e) => set({ rol: e.target.value })}
                        maxLength={300}
                        placeholder="Ej.: Maestro carpintero"
                        className={`${inputClass} min-w-44 w-full`}
                      />
                    </td>
                    <td className="p-1.5">
                      {numberInput(`Personas ${index + 1}`, m.cantidad_personas, (cantidad_personas) => set({ cantidad_personas }), true)}
                    </td>
                    <td className="p-1.5">
                      {numberInput(`Días ${index + 1}`, m.dias_estimados, (dias_estimados) => set({ dias_estimados }))}
                    </td>
                    <td className="p-1.5">
                      {amountInput(`Jornal ${index + 1}`, m.valor_jornal_diario, (valor_jornal_diario) => set({ valor_jornal_diario }))}
                    </td>
                    <td className="p-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => update({ mano_de_obra: draft.mano_de_obra.filter((_, i) => i !== index) })}
                        aria-label={`Eliminar mano de obra ${index + 1}`}
                        className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          update({
            mano_de_obra: [
              ...draft.mano_de_obra,
              { rol: '', cantidad_personas: 1, dias_estimados: 1, valor_jornal_diario: 0, subtotal: 0 },
            ],
          })
        }
        className="text-xs font-heading font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-2 transition-colors"
      >
        <Plus size={15} />
        <span>Agregar mano de obra</span>
      </button>
    </section>
  );

  return (
    <section
      aria-label="Editar cotización"
      className={
        embedded
          ? 'w-full text-gray-900 dark:text-gray-100 space-y-5'
          : 'mx-auto max-w-5xl bg-white dark:bg-[#141A23] text-gray-900 dark:text-gray-100 rounded-2xl shadow-xl p-4 sm:p-6 space-y-5 border border-kraft-200 dark:border-[#263040]'
      }
    >
      {!embedded && (
        <div className="border-b border-kraft-100 dark:border-[#222B3A] pb-3">
          <h2 className="text-xl font-heading font-bold text-navy-900 dark:text-white">Editar cotización</h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Modifica este presupuesto. Los totales se recalculan al editar.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-3 text-sm flex items-start gap-2"
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            {error}{' '}
            {id && (
              <button type="button" className="underline ml-1 font-semibold" onClick={() => void load()} disabled={busy}>
                Cargar versión guardada
              </button>
            )}
          </div>
        </div>
      )}

      {locked && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200"
        >
          Este presupuesto ya está aplicado. Crea una alternativa desde Presupuestos para revisar el cambio antes de actualizar la obra.
        </p>
      )}

      {!draft ? (
        <p role="status" className="text-sm text-gray-500 py-4">
          {busy ? 'Cargando presupuesto…' : 'No se pudo abrir la edición.'}
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!calculated || locked) return;
            setBusy(true);
            setError('');
            try {
              const res = await fetch('/api/presupuestos', {
                method: row ? 'PATCH' : 'POST',
                headers: await aiHeaders(),
                body: JSON.stringify(
                  row
                    ? { id: row.id, updated_at: row.updated_at, cotizacion: calculated }
                    : {
                        cotizacion: calculated,
                        proyecto_id: projectId,
                        tipo: groupType,
                        nombre_alternativa: calculated.nombre_alternativa || 'Propuesta original',
                      },
                ),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
              onSaved(data.presupuesto);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-5"
        >
          <fieldset disabled={busy || locked} className="space-y-5 disabled:opacity-70">
            {/* Selector de modalidad */}
            <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 flex-1 space-y-1.5">
                  <span>Tipo de cotización</span>
                  <select
                    aria-label="Tipo de cotización"
                    value={draft.modo_presupuesto || 'estimado'}
                    onChange={(e) =>
                      update({
                        modo_presupuesto: e.target.value as 'estimado' | 'precio_acordado',
                        partidas_venta: draft.partidas_venta?.length
                          ? draft.partidas_venta
                          : [{ nombre: 'Alcance completo', unidad: 'gl', cantidad: 1, precio_unitario: 0, subtotal: 0 }],
                      })
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="estimado">Estimación por costos (materiales + mano de obra + margen)</option>
                    <option value="precio_acordado">Precios acordados con el cliente</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isAgreed
                  ? 'Ideal cuando ya pactaste un precio final o estás traspasando un presupuesto: ObraTrack respeta tus montos exactos.'
                  : 'Calcula el precio final sumando materiales, mano de obra, gastos generales, imprevistos y utilidad.'}
              </p>
            </div>

            {/* Datos principales del proyecto */}
            <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-obra-orange/15 text-obra-orange font-heading font-black text-xs inline-flex items-center justify-center">
                  1
                </span>
                <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                  Datos del proyecto
                </h3>
              </div>

              <div className="grid sm:grid-cols-2 gap-3.5">
                {field('Nombre del proyecto', 'titulo_proyecto', 'text', 'Ej.: Remodelación terraza y cobertizo')}
                {field('Cliente', 'cliente_nombre', 'text', 'Nombre del cliente o empresa')}
                {field('Ubicación', 'comuna_region', 'text', 'Comuna o dirección')}
                <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                  <span>Plazo estimado (días)</span>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={draft.duracion_dias_estimada}
                    onChange={(e) => update({ duracion_dias_estimada: e.target.valueAsNumber || 0 })}
                    className={`${inputClass} w-full font-mono`}
                  />
                </label>
              </div>

              {!isAgreed ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-3.5 pt-1">
                    {field('Contacto', 'cliente_contacto')}
                    {field('Correo del cliente', 'cliente_email', 'email')}
                    {field('Teléfono del cliente', 'cliente_telefono', 'tel')}
                    {field('Válida hasta', 'fecha_validez', 'date')}
                  </div>
                  <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                    <span>Descripción del proyecto</span>
                    <textarea
                      value={draft.resumen_ejecutivo}
                      onChange={(e) => update({ resumen_ejecutivo: e.target.value })}
                      className={`${inputClass} w-full`}
                      rows={3}
                      maxLength={6000}
                    />
                  </label>
                </>
              ) : (
                <details
                  open={hasExtraClientDetails}
                  className="group rounded-xl border border-kraft-200/80 dark:border-[#263040] bg-kraft-50/50 dark:bg-[#0F141C] px-3.5 py-2.5"
                >
                  <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <span className="inline-flex items-center gap-1.5">
                      <User size={14} className="text-obra-orange" />
                      <span>Más datos del cliente y descripción (opcional)</span>
                    </span>
                    <ChevronDown size={15} className="transition-transform group-open:rotate-180 text-gray-400" />
                  </summary>
                  <div className="mt-3 pt-3 border-t border-kraft-200/70 dark:border-[#222B3A] space-y-3.5">
                    <div className="grid sm:grid-cols-2 gap-3.5">
                      {field('Contacto', 'cliente_contacto')}
                      {field('Correo del cliente', 'cliente_email', 'email')}
                      {field('Teléfono del cliente', 'cliente_telefono', 'tel')}
                      {field('Válida hasta', 'fecha_validez', 'date')}
                    </div>
                    <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                      <span>Descripción del proyecto</span>
                      <textarea
                        value={draft.resumen_ejecutivo}
                        onChange={(e) => update({ resumen_ejecutivo: e.target.value })}
                        placeholder="Breve resumen del alcance incluido en el presupuesto…"
                        className={`${inputClass} w-full`}
                        rows={2}
                        maxLength={6000}
                      />
                    </label>
                  </div>
                </details>
              )}
            </div>

            {/* Bloque principal de Precio Acordado */}
            {isAgreed && (
              <section
                className="rounded-2xl border-2 border-obra-orange/30 dark:border-[#FF6A00]/30 bg-gradient-to-b from-orange-50/50 via-white to-white dark:from-[#FF6A00]/5 dark:via-[#141A23] dark:to-[#141A23] p-4 sm:p-5 space-y-4"
                aria-label="Partidas de venta"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-obra-orange text-white font-heading font-black text-xs inline-flex items-center justify-center shadow-xs">
                      2
                    </span>
                    <div>
                      <h3 className="font-heading font-bold text-sm text-navy-900 dark:text-white">
                        Partidas y precio acordado
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Separa tus partidas de trabajo de los materiales para mostrar dos secciones claras en la cotización y el PDF.
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-[#0F141C] border border-kraft-200 dark:border-[#263040] px-2.5 py-1 text-[11px] font-mono font-bold text-navy-900 dark:text-gray-200">
                    <Receipt size={12} className="text-obra-orange" />
                    {(draft.partidas_venta || []).length}{' '}
                    {(draft.partidas_venta || []).length === 1 ? 'partida' : 'partidas'}
                  </span>
                </div>

                {/* Selector de IVA destacado y muy claro */}
                <div
                  className={`rounded-2xl border p-3.5 space-y-2 transition-colors ${
                    !draft.tratamiento_iva
                      ? 'border-amber-300 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/25'
                      : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  }`}
                >
                  <label className="block space-y-1.5 text-xs font-bold text-navy-900 dark:text-gray-100">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span>IVA de los precios acordados</span>
                      {!draft.tratamiento_iva ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[10px] font-bold">
                          <AlertCircle size={11} />
                          Requerido para guardar
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                          <CheckCircle2 size={11} />
                          {draft.tratamiento_iva === 'incluido' ? 'Total exacto con IVA' : 'Se sumará 19% IVA'}
                        </span>
                      )}
                    </span>
                    <select
                      aria-label="IVA de los precios acordados"
                      value={draft.tratamiento_iva || ''}
                      onChange={(e) => update({ tratamiento_iva: e.target.value as 'neto' | 'incluido' })}
                      className={`${inputClass} w-full font-medium`}
                    >
                      <option value="">Selecciona cómo se entregaron los precios</option>
                      <option value="incluido">Los precios incluyen IVA</option>
                      <option value="neto">Los precios son netos; agregar IVA</option>
                    </select>
                  </label>
                </div>

                {/* Tarjetas limpias por partida */}
                <div className="space-y-3">
                  {(draft.partidas_venta || []).map((p, index) => {
                    const displayPrice = p.precio_partida ?? p.precio_unitario;
                    const lineSubtotal =
                      p.precio_partida != null
                        ? p.precio_partida
                        : Math.round((Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0));
                    return (
                      <div
                        key={index}
                        className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#0F141C] p-3.5 sm:p-4 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Partida #{index + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-kraft-50 dark:bg-[#141A23] border border-kraft-200/80 dark:border-[#263040] px-2.5 py-0.5 text-xs font-mono font-bold text-navy-900 dark:text-white">
                              {formatCLP(lineSubtotal)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Eliminar partida de venta ${index + 1}`}
                              onClick={() =>
                                update({
                                  partidas_venta: draft.partidas_venta!.filter((_, i) => i !== index),
                                })
                              }
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-2.5">
                          <div className="sm:col-span-2 space-y-1">
                            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              Descripción del trabajo o material
                            </span>
                            <input
                              aria-label={`Partida de venta ${index + 1}`}
                              value={p.nombre}
                              onChange={(e) =>
                                update({
                                  partidas_venta: draft.partidas_venta!.map((r, i) =>
                                    i === index ? { ...r, nombre: e.target.value } : r,
                                  ),
                                })
                              }
                              placeholder="Ej.: Radier 20 m², terminaciones o Cemento Polpaico"
                              className={`${inputClass} w-full`}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              Sección en PDF
                            </span>
                            <select
                              aria-label={`Tipo de línea ${index + 1}`}
                              value={resolveSaleLineKind(p)}
                              onChange={(e) =>
                                update({
                                  partidas_venta: draft.partidas_venta!.map((r, i) =>
                                    i === index ? { ...r, tipo: e.target.value as 'partida' | 'material' } : r,
                                  ),
                                })
                              }
                              className={`${inputClass} w-full`}
                            >
                              <option value="partida">Partida / Trabajo</option>
                              <option value="material">Material</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              Cantidad
                            </span>
                            {numberInput(
                              `Cantidad de venta ${index + 1}`,
                              p.cantidad,
                              (cantidad) =>
                                update({
                                  partidas_venta: draft.partidas_venta!.map((r, i) =>
                                    i === index ? { ...r, cantidad } : r,
                                  ),
                                }),
                              false,
                              true,
                            )}
                          </div>
                          <div className="space-y-1">
                            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              Unidad
                            </span>
                            <input
                              aria-label={`Unidad de venta ${index + 1}`}
                              value={p.unidad}
                              onChange={(e) =>
                                update({
                                  partidas_venta: draft.partidas_venta!.map((r, i) =>
                                    i === index ? { ...r, unidad: e.target.value } : r,
                                  ),
                                })
                              }
                              placeholder="gl, m2, un"
                              className={`${inputClass} w-full`}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1 space-y-1">
                            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              {p.precio_partida == null ? 'Precio unitario (CLP)' : 'Monto partida (CLP)'}
                            </span>
                            {amountInput(
                              `Precio de venta ${index + 1}`,
                              displayPrice,
                              (precio) =>
                                update({
                                  partidas_venta: draft.partidas_venta!.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          ...(r.precio_partida == null
                                            ? { precio_unitario: precio }
                                            : { precio_partida: precio }),
                                        }
                                      : r,
                                  ),
                                }),
                              true,
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    update({
                      partidas_venta: [
                        ...(draft.partidas_venta || []),
                        { nombre: '', cantidad: 1, unidad: 'gl', precio_unitario: 0, subtotal: 0, tipo: 'partida' },
                      ],
                    })
                  }
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-obra-orange/50 bg-orange-50/70 dark:bg-[#FF6A00]/10 hover:bg-obra-orange hover:text-white px-4 py-2.5 text-xs font-heading font-bold text-obra-orange transition-all"
                >
                  <Plus size={15} />
                  <span>Añadir partida de venta</span>
                </button>
              </section>
            )}

            {/* Materiales y Mano de obra: siempre visibles en modo estimado; en precio acordado colapsables si están vacíos */}
            {isAgreed ? (
              <details
                open={hasCostDetails}
                className="group rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4"
              >
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex flex-wrap items-center justify-between gap-2 text-sm font-heading font-bold text-navy-900 dark:text-white">
                  <span className="inline-flex items-center gap-2">
                    <Package size={16} className="text-obra-orange" />
                    <span>Detalle interno para compras de obra (opcional)</span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {hasCostDetails ? (
                      <span className="rounded-full bg-obra-orange/10 text-obra-orange px-2.5 py-0.5 font-mono font-bold text-[11px]">
                        {draft.materiales.length} mat. · {draft.mano_de_obra.length} m.o.
                      </span>
                    ) : (
                      <span>Para incorporar a la obra</span>
                    )}
                    <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="mt-4 pt-4 border-t border-kraft-100 dark:border-[#222B3A] space-y-5">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Estos materiales no alteran tu precio acordado; quedan listos para cargarse a la lista de compras y costos de la obra al aprobar el presupuesto.
                  </p>
                  {materialsSection}
                  {laborSection}
                </div>
              </details>
            ) : (
              <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 space-y-5">
                {materialsSection}
                <div className="border-t border-kraft-100 dark:border-[#222B3A] pt-5">{laborSection}</div>
                <div className="border-t border-kraft-100 dark:border-[#222B3A] pt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {(
                    [
                      'gastos_generales_porcentaje',
                      'imprevistos_porcentaje',
                      'margen_utilidad_porcentaje',
                    ] as const
                  ).map((key, i) => (
                    <label key={key} className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                      <span>{['Gastos generales (%)', 'Imprevistos (%)', 'Utilidad o margen (%)'][i]}</span>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        step="any"
                        value={draft.estructura_financiera[key]}
                        onChange={(e) =>
                          update({
                            estructura_financiera: {
                              ...draft.estructura_financiera,
                              [key]: e.target.valueAsNumber || 0,
                            },
                          })
                        }
                        className={`${inputClass} w-full font-mono`}
                      />
                    </label>
                  ))}
                  <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                    <span>Cálculo de utilidad</span>
                    <select
                      value={draft.estructura_financiera.tipo_utilidad}
                      onChange={(e) =>
                        update({
                          estructura_financiera: {
                            ...draft.estructura_financiera,
                            tipo_utilidad: e.target.value as 'recargo_costos' | 'margen_venta',
                          },
                        })
                      }
                      className={`${inputClass} w-full`}
                    >
                      <option value="recargo_costos">Sobre costos e indirectos</option>
                      <option value="margen_venta">Margen sobre venta</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {/* Documento PDF y Plan de cobro */}
            <details className="group rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 text-sm">
              <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-2 font-heading font-bold text-navy-900 dark:text-white">
                <span className="inline-flex items-center gap-2">
                  <FileText size={16} className="text-obra-orange" />
                  <span>Documento y plan de cobro</span>
                </span>
                <ChevronDown size={16} className="transition-transform group-open:rotate-180 text-gray-400" />
              </summary>
              <div className="mt-4 pt-4 border-t border-kraft-100 dark:border-[#222B3A] space-y-4">
                <div className="grid sm:grid-cols-2 gap-3.5 items-center">
                  <label className="flex gap-2.5 items-center text-xs font-semibold text-navy-900 dark:text-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.mostrar_fecha !== false}
                      onChange={(e) => update({ mostrar_fecha: e.target.checked })}
                      className="rounded border-kraft-300 text-obra-orange focus:ring-obra-orange"
                    />
                    <span>Mostrar fecha de emisión en el PDF</span>
                  </label>
                  <label className="block space-y-1.5 text-xs font-semibold text-navy-900 dark:text-gray-200">
                    <span>Nombre del archivo PDF</span>
                    <input
                      value={draft.nombre_archivo || ''}
                      onChange={(e) => update({ nombre_archivo: e.target.value })}
                      maxLength={150}
                      placeholder="Automático"
                      className={`${inputClass} w-full`}
                    />
                  </label>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-navy-900 dark:text-gray-200">
                      Hitos de cobro (opcional · deben sumar 100%)
                    </span>
                    {(draft.hitos_pago || []).length > 0 && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono font-bold ${
                          Math.abs(milestonesPct - 100) < 0.01
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        Suma: {milestonesPct}%
                      </span>
                    )}
                  </div>

                  {(draft.hitos_pago || []).map((h, index) => (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50/50 dark:bg-[#0F141C] p-2.5"
                    >
                      <input
                        aria-label={`Nombre del hito ${index + 1}`}
                        value={h.nombre}
                        placeholder="Ej.: Anticipo, Avance 50%, Entrega"
                        onChange={(e) =>
                          update({
                            hitos_pago: draft.hitos_pago!.map((r, i) =>
                              i === index ? { ...r, nombre: e.target.value } : r,
                            ),
                          })
                        }
                        className={`${inputClass} flex-1 min-w-40`}
                      />
                      <div className="inline-flex items-center gap-1">
                        {numberInput(`Porcentaje del hito ${index + 1}`, h.porcentaje, (porcentaje) =>
                          update({
                            hitos_pago: draft.hitos_pago!.map((r, i) =>
                              i === index ? { ...r, porcentaje } : r,
                            ),
                          }),
                        )}
                        <span className="text-xs font-bold text-gray-500">%</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Eliminar hito ${index + 1}`}
                        onClick={() => update({ hitos_pago: draft.hitos_pago!.filter((_, i) => i !== index) })}
                        className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-obra-orange hover:underline"
                    onClick={() =>
                      update({ hitos_pago: [...(draft.hitos_pago || []), { nombre: '', porcentaje: 0, monto: 0 }] })
                    }
                  >
                    <Plus size={14} />
                    <span>Añadir hito de cobro</span>
                  </button>

                  {calculated?.hitos_pago && calculated.hitos_pago.length > 0 && (
                    <div className="rounded-xl bg-kraft-50 dark:bg-[#0F141C] border border-kraft-200/80 dark:border-[#263040] p-3 space-y-1 text-xs">
                      {calculated.hitos_pago.map((h, i) => (
                        <p key={i} className="flex items-center justify-between gap-2 text-navy-900 dark:text-gray-200">
                          <span className="font-medium">{h.nombre}:</span>
                          <span className="font-mono font-bold">
                            {formatCLP(h.monto)} ({h.porcentaje}%)
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>

            {/* Observaciones y condiciones de pago */}
            {isAgreed ? (
              <details
                open={hasNotesDetails}
                className="group rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4"
              >
                <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-2 text-sm font-heading font-bold text-navy-900 dark:text-white">
                  <span>Observaciones y condiciones de pago (opcional)</span>
                  <ChevronDown size={16} className="transition-transform group-open:rotate-180 text-gray-400" />
                </summary>
                <div className="mt-4 pt-4 border-t border-kraft-100 dark:border-[#222B3A] grid sm:grid-cols-2 gap-4">
                  <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                    <span>Observaciones adicionales</span>
                    <textarea
                      value={draft.observaciones || ''}
                      onChange={(e) => update({ observaciones: e.target.value })}
                      placeholder="Garantías, exclusiones o notas técnicas…"
                      className={`${inputClass} w-full`}
                      rows={3}
                      maxLength={6000}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                    <span>Condiciones de pago</span>
                    <textarea
                      value={draft.condiciones_pago || ''}
                      onChange={(e) => update({ condiciones_pago: e.target.value })}
                      placeholder="Ej.: 50% al inicio, 50% contra entrega."
                      className={`${inputClass} w-full`}
                      rows={3}
                      maxLength={6000}
                    />
                  </label>
                </div>
              </details>
            ) : (
              <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 grid sm:grid-cols-2 gap-4">
                <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                  <span>Observaciones adicionales</span>
                  <textarea
                    value={draft.observaciones || ''}
                    onChange={(e) => update({ observaciones: e.target.value })}
                    className={`${inputClass} w-full`}
                    rows={3}
                    maxLength={6000}
                  />
                </label>
                <label className="block text-xs font-semibold text-navy-900 dark:text-gray-200 space-y-1.5">
                  <span>Condiciones de pago</span>
                  <textarea
                    value={draft.condiciones_pago || ''}
                    onChange={(e) => update({ condiciones_pago: e.target.value })}
                    className={`${inputClass} w-full`}
                    rows={3}
                    maxLength={6000}
                  />
                </label>
              </div>
            )}
          </fieldset>

          {invalid && (
            <div
              role="status"
              className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs sm:text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2"
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{invalid}</span>
            </div>
          )}

          {/* Barra inferior sticky con resumen claro en vivo */}
          <div className="sticky bottom-0 z-10 -mx-1 px-3 py-3.5 rounded-2xl bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md border border-kraft-200 dark:border-[#263040] shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div aria-live="polite" className="min-w-0">
              {calculated ? (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block">
                      Total con IVA
                    </span>
                    <strong className="text-xl sm:text-2xl font-mono font-black text-navy-900 dark:text-white">
                      Total {formatCLP(calculated.estructura_financiera.precio_total_con_iva)}
                    </strong>
                  </div>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    Neto {formatCLP(calculated.estructura_financiera.precio_sugerido_neto)} · IVA{' '}
                    {formatCLP(calculated.estructura_financiera.iva_19)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Completa el nombre, el monto y el tipo de IVA para ver el total.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-kraft-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || locked || !calculated}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#F97316] hover:from-[#E55F00] hover:to-[#EA580C] text-white text-xs sm:text-sm font-heading font-bold shadow-md shadow-obra-orange/25 disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2 transition-all"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{busy ? 'Guardando…' : 'Guardar cambios'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {!draft && (
        <button type="button" onClick={onCancel} className="text-sm underline text-obra-orange font-semibold">
          Volver a la cotización
        </button>
      )}
    </section>
  );
}
