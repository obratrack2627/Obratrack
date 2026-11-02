'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import type { CotizacionEstimacion } from '@/types/database';
import type { Presupuesto } from '@/lib/presupuestos';
import { aiHeaders } from '@/lib/ai/client';
import { reviseQuote } from '@/lib/quotes/revise';
import { formatCLP, formatThousands, parseThousands } from '@/lib/utils';

const inputClass = 'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#0B0F14] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-obra-orange';

export default function QuoteEditor({ id, onCancel, onSaved }: { id: string; onCancel: () => void; onSaved: (row: Presupuesto) => void }) {
  const [row, setRow] = useState<Presupuesto | null>(null);
  const [draft, setDraft] = useState<CotizacionEstimacion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/presupuestos?id=' + encodeURIComponent(id), { headers: await aiHeaders(), cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el presupuesto.');
      const current: Presupuesto | undefined = data.presupuestos.find((r: Presupuesto) => r.id === id);
      if (!current) throw new Error('La cotización no está disponible para editar. Actualiza el listado de presupuestos.');
      setRow(current);
      setDraft({ ...current.cotizacion, estructura_financiera: { ...current.cotizacion.estructura_financiera, tipo_utilidad: current.cotizacion.estructura_financiera.tipo_utilidad || 'recargo_costos' } });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [id]);
  let calculated: CotizacionEstimacion | null = null;
  let invalid = '';
  if (row && draft) {
    try { calculated = reviseQuote(row.cotizacion, draft); } catch (e) { invalid = (e as Error).message; }
  }
  const update = (changes: Partial<CotizacionEstimacion>) => setDraft((d) => d ? { ...d, ...changes } : d);
  const field = (label: string, key: 'titulo_proyecto' | 'comuna_region' | 'cliente_nombre' | 'cliente_contacto' | 'cliente_email' | 'cliente_telefono' | 'fecha_validez', type = 'text') => (
    <label className="space-y-1 text-sm"><span>{label}</span><input type={type} value={draft?.[key] || ''} onChange={(e) => update({ [key]: e.target.value })} className={`${inputClass} w-full`} maxLength={300} /></label>
  );
  const amountInput = (label: string, value: number, change: (v: number) => void) => <input aria-label={label} inputMode="numeric" value={formatThousands(value)} onChange={(e) => change(parseThousands(e.target.value))} className={`${inputClass} w-32 text-right`} />;
  const numberInput = (label: string, value: number, change: (v: number) => void, integer = false) => <input aria-label={label} type="number" min="0" step={integer ? '1' : 'any'} value={value} onChange={(e) => change(e.target.valueAsNumber || 0)} className={`${inputClass} w-24 text-right`} />;

  return <section aria-label="Editar cotización" className="mx-auto max-w-5xl bg-white dark:bg-[#141A23] text-gray-900 dark:text-gray-100 rounded-xl shadow-xl p-4 sm:p-6 space-y-6">
    <div><h2 className="text-xl font-bold">Editar cotización</h2><p className="text-sm text-gray-500 mt-1">Modifica este presupuesto. Los totales se recalculan al editar.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 text-red-800 p-3 text-sm">{error} <button type="button" className="underline ml-2" onClick={() => void load()} disabled={busy}>Cargar versión guardada</button></div>}
    {!draft ? <p role="status" className="text-sm">{busy ? 'Cargando presupuesto…' : 'No se pudo abrir la edición.'}</p> : <form onSubmit={async (e) => {
      e.preventDefault(); if (!calculated || !row) return;
      setBusy(true); setError('');
      try {
        const res = await fetch('/api/presupuestos', { method: 'PATCH', headers: await aiHeaders(), body: JSON.stringify({ id, updated_at: row.updated_at, cotizacion: calculated }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');
        onSaved(data.presupuesto);
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }} className="space-y-6">
      <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
        <div className="grid sm:grid-cols-2 gap-4">{field('Nombre del proyecto', 'titulo_proyecto')}{field('Ubicación', 'comuna_region')}{field('Cliente', 'cliente_nombre')}{field('Contacto', 'cliente_contacto')}{field('Correo del cliente', 'cliente_email', 'email')}{field('Teléfono del cliente', 'cliente_telefono', 'tel')}{field('Válida hasta', 'fecha_validez', 'date')}<label className="text-sm space-y-1"><span>Plazo estimado (días)</span><input type="number" min="0.1" step="any" value={draft.duracion_dias_estimada} onChange={(e) => update({ duracion_dias_estimada: e.target.valueAsNumber || 0 })} className={`${inputClass} w-full`} /></label></div>
        <label className="block text-sm space-y-1"><span>Descripción del proyecto</span><textarea value={draft.resumen_ejecutivo} onChange={(e) => update({ resumen_ejecutivo: e.target.value })} className={`${inputClass} w-full`} rows={3} maxLength={6000} /></label>
        <section className="space-y-3"><h3 className="font-bold">Materiales <span className="text-xs font-normal text-gray-500">Precios netos en CLP</span></h3><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Descripción', 'Unidad', 'Cantidad', 'Precio unitario', ''].map((h, i) => <th key={i} className="p-2">{h}</th>)}</tr></thead><tbody>{draft.materiales.map((m, index) => {
          const set = (change: Record<string, any>) => update({ materiales: draft.materiales.map((item, i) => i === index ? { ...item, ...change } : item) });
          return <tr key={index}><td className="p-1"><input aria-label={`Material ${index + 1}`} value={m.nombre} onChange={(e) => set({ nombre: e.target.value })} maxLength={500} className={`${inputClass} min-w-52 w-full`} /></td><td className="p-1"><input aria-label={`Unidad material ${index + 1}`} value={m.unidad} onChange={(e) => set({ unidad: e.target.value })} maxLength={30} className={`${inputClass} w-20`} /></td><td className="p-1">{numberInput(`Cantidad material ${index + 1}`, m.cantidad, (cantidad) => set({ cantidad }))}</td><td className="p-1">{amountInput(`Precio material ${index + 1}`, m.precio_unitario_estimado, (precio_unitario_estimado) => set({ precio_unitario_estimado, precio_original_con_iva: undefined }))}</td><td className="p-1"><button type="button" onClick={() => update({ materiales: draft.materiales.filter((_, i) => i !== index) })} aria-label={`Eliminar material ${index + 1}`} className="p-2 text-red-600"><Trash2 size={16} /></button></td></tr>;
        })}</tbody></table></div><button type="button" onClick={() => update({ materiales: [...draft.materiales, { nombre: '', unidad: 'un', cantidad: 1, precio_unitario_estimado: 0, subtotal: 0, categoria: 'general', mejor_tienda: 'Por cotizar', precio_mas_barato: 0, ahorro_estimado: 0 }] })} className="text-sm text-obra-orange font-semibold inline-flex items-center gap-1"><Plus size={16} />Agregar material</button></section>
        <section className="space-y-3"><h3 className="font-bold">Mano de obra</h3><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Oficio', 'Personas', 'Días', 'Jornal neto', ''].map((h, i) => <th key={i} className="p-2">{h}</th>)}</tr></thead><tbody>{draft.mano_de_obra.map((m, index) => {
          const set = (change: Record<string, any>) => update({ mano_de_obra: draft.mano_de_obra.map((item, i) => i === index ? { ...item, ...change } : item) });
          return <tr key={index}><td className="p-1"><input aria-label={`Oficio ${index + 1}`} value={m.rol} onChange={(e) => set({ rol: e.target.value })} maxLength={300} className={`${inputClass} min-w-52 w-full`} /></td><td className="p-1">{numberInput(`Personas ${index + 1}`, m.cantidad_personas, (cantidad_personas) => set({ cantidad_personas }), true)}</td><td className="p-1">{numberInput(`Días ${index + 1}`, m.dias_estimados, (dias_estimados) => set({ dias_estimados }))}</td><td className="p-1">{amountInput(`Jornal ${index + 1}`, m.valor_jornal_diario, (valor_jornal_diario) => set({ valor_jornal_diario }))}</td><td className="p-1"><button type="button" onClick={() => update({ mano_de_obra: draft.mano_de_obra.filter((_, i) => i !== index) })} aria-label={`Eliminar mano de obra ${index + 1}`} className="p-2 text-red-600"><Trash2 size={16} /></button></td></tr>;
        })}</tbody></table></div><button type="button" onClick={() => update({ mano_de_obra: [...draft.mano_de_obra, { rol: '', cantidad_personas: 1, dias_estimados: 1, valor_jornal_diario: 0, subtotal: 0 }] })} className="text-sm text-obra-orange font-semibold inline-flex items-center gap-1"><Plus size={16} />Agregar mano de obra</button></section>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{(['gastos_generales_porcentaje', 'imprevistos_porcentaje', 'margen_utilidad_porcentaje'] as const).map((key, i) => <label key={key} className="text-sm space-y-1"><span>{['Gastos generales (%)', 'Imprevistos (%)', 'Utilidad o margen (%)'][i]}</span><input type="number" min="0" max="1000" step="any" value={draft.estructura_financiera[key]} onChange={(e) => update({ estructura_financiera: { ...draft.estructura_financiera, [key]: e.target.valueAsNumber || 0 } })} className={`${inputClass} w-full`} /></label>)}<label className="text-sm space-y-1"><span>Cálculo de utilidad</span><select value={draft.estructura_financiera.tipo_utilidad} onChange={(e) => update({ estructura_financiera: { ...draft.estructura_financiera, tipo_utilidad: e.target.value as 'recargo_costos' | 'margen_venta' } })} className={`${inputClass} w-full`}><option value="recargo_costos">Sobre costos e indirectos</option><option value="margen_venta">Margen sobre venta</option></select></label></div>
        <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm space-y-1"><span>Observaciones adicionales</span><textarea value={draft.observaciones || ''} onChange={(e) => update({ observaciones: e.target.value })} className={`${inputClass} w-full`} rows={3} maxLength={6000} /></label><label className="text-sm space-y-1"><span>Condiciones de pago</span><textarea value={draft.condiciones_pago || ''} onChange={(e) => update({ condiciones_pago: e.target.value })} className={`${inputClass} w-full`} rows={3} maxLength={6000} /></label></div>
      </fieldset>
      {invalid && <p role="status" className="text-sm text-red-600 dark:text-red-400">{invalid}</p>}
      <div className="sticky bottom-0 bg-white dark:bg-[#141A23] border-t border-gray-200 dark:border-gray-700 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="text-sm">{calculated && <>Neto {formatCLP(calculated.estructura_financiera.precio_sugerido_neto)} · IVA {formatCLP(calculated.estructura_financiera.iva_19)}<strong className="block text-lg">Total {formatCLP(calculated.estructura_financiera.precio_total_con_iva)}</strong></>}</div>
        <div className="flex gap-2"><button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">Cancelar</button><button type="submit" disabled={busy || !calculated} className="px-4 py-2 rounded-lg bg-obra-orange text-white text-sm font-bold disabled:opacity-60 inline-flex items-center gap-2">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </div>
    </form>}
    {!draft && <button type="button" onClick={onCancel} className="text-sm underline">Volver a la cotización</button>}
  </section>;
}
