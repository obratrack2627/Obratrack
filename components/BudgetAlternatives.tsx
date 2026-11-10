'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Plus, Check } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import MoneyAmount from './MoneyAmount';
import QuoteEditor from './QuoteEditor';
import CotizacionPdfModal from './CotizacionPdfModal';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import { budgetStatuses, type Presupuesto, type BudgetStatus } from '@/lib/presupuestos';
import type { CotizacionEstimacion } from '@/types/database';
import { formatCLP } from '@/lib/utils';

const input = 'w-full min-w-0 max-w-full rounded-lg border border-kraft-200 dark:border-gray-600 bg-white dark:bg-[#141A23] p-2 text-sm';
export const budgetLabels: Record<BudgetStatus, string> = { borrador: 'Borrador', enviada: 'Enviada', aprobada: 'Aprobada', rechazada: 'Rechazada', anulada: 'Anulada', no_elegida: 'No elegida' };
const name = (row: Presupuesto) => row.cotizacion.nombre_alternativa || row.nombre_alternativa || row.cotizacion.titulo_proyecto;

function blankQuote(): CotizacionEstimacion {
  return {
    id: `cot-${crypto.randomUUID()}`, modo_presupuesto: 'precio_acordado', titulo_proyecto: '', tipo_obra: 'General', comuna_region: '', duracion_dias_estimada: 1,
    resumen_ejecutivo: '', materiales: [], mano_de_obra: [], partidas_venta: [{ nombre: 'Alcance completo', unidad: 'gl', cantidad: 1, precio_unitario: 0, subtotal: 0 }],
    estructura_financiera: { costo_materiales_total: 0, costo_mano_obra_total: 0, costo_directo: 0, gastos_generales_porcentaje: 0, gastos_generales_monto: 0, imprevistos_porcentaje: 0, imprevistos_monto: 0, margen_utilidad_porcentaje: 0, margen_utilidad_monto: 0, precio_sugerido_neto: 0, iva_19: 0, precio_total_con_iva: 0, ahorro_compras_estrategicas: 0, tipo_utilidad: 'recargo_costos' },
    actividades_gantt: [], radar_proveedores: [], consejos_experto_pyme: [], fecha_creacion: new Date().toISOString(),
  };
}

export function BudgetCreateDialog({ projectId, projects, onClose, onSaved }: { projectId?: string; projects: { id: string; nombre: string }[]; onClose: () => void; onSaved: (row: Presupuesto) => void }) {
  const [initial] = useState(blankQuote);
  const [project, setProject] = useState(projectId || '');
  const [kind, setKind] = useState<'principal'|'complementario'>('principal');
  return <ModalOverlay onClose={onClose} aria-label="Nuevo presupuesto" className="fixed inset-0 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
    <div className="relative w-full max-w-5xl rounded-2xl bg-white dark:bg-[#141A23] p-3 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg">Nuevo presupuesto</h2><button type="button" aria-label="Cerrar presupuesto nuevo" onClick={onClose}><X size={20} /></button></div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm space-y-1"><span>Obra</span><select aria-label="Obra del nuevo presupuesto" className={input} value={project} onChange={(e) => setProject(e.target.value)} disabled={!!projectId}><option value="">Crear la obra después de elegir</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><label className="text-sm space-y-1"><span>Alcance</span><select aria-label="Tipo de alcance" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={input}><option value="principal">Principal · define el presupuesto base</option><option value="complementario">Complementario · se suma a la obra</option></select></label></div>
      <QuoteEditor initial={initial} projectId={project || undefined} groupType={kind} onCancel={onClose} onSaved={onSaved} />
    </div>
  </ModalOverlay>;
}

export function BudgetAlternativeDialog({ source, onClose, onSaved }: { source: Presupuesto; onClose: () => void; onSaved: (row: Presupuesto) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'principal'|'complementario'>('principal');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <ModalOverlay onClose={onClose} aria-label="Crear alternativa" className="fixed inset-0 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"><form className="w-full max-w-md max-h-full overflow-y-auto bg-white dark:bg-[#141A23] rounded-2xl p-5 space-y-4" onSubmit={async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/presupuestos', { method: 'POST', headers: await aiHeaders(), body: JSON.stringify({ origen_id: source.id, updated_at: source.updated_at, nombre_alternativa: label.trim(), tipo: kind }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo crear la alternativa.');
      onSaved({ ...body.presupuesto, grupo: body.grupo });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}><div className="flex justify-between gap-3"><h2 className="text-lg font-bold">Crear alternativa</h2><button type="button" onClick={onClose} aria-label="Cerrar alternativa"><X size={20} /></button></div>
    <p className="text-sm text-gray-500">Se copiará «{name(source)}» para editar la opción nueva. La obra conserva su presupuesto actual hasta que elijas y apliques el cambio.</p>
    <label className="block text-sm space-y-1"><span>Nombre de la alternativa</span><input autoComplete="off" required maxLength={150} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej.: Cortavista con deck WPC" className={input} /></label>
    {!source.grupo_id && source.proyecto_id && <label className="block text-sm space-y-1"><span>Tipo de alcance</span><select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={input}><option value="principal">Presupuesto principal</option><option value="complementario">Alcance complementario</option></select></label>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" disabled={busy || !label.trim()} className="rounded-xl bg-obra-orange text-white px-4 py-2 font-semibold text-sm">{busy ? 'Creando…' : 'Crear y editar'}</button></div>
  </form></ModalOverlay>;
}

export function BudgetChoiceDialog({ row, onClose, onSaved }: { row: Presupuesto; onClose: () => void; onSaved: (result: any) => void }) {
  const [gantt, setGantt] = useState(!row.proyecto_id || !!row.grupo?.ejecucion?.actividades?.length);
  const [materials, setMaterials] = useState(!row.proyecto_id || !!row.grupo?.ejecucion?.materiales_proyecto?.length);
  const [kind, setKind] = useState<'principal'|'complementario'>(row.grupo?.tipo || 'principal');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const project = row.proyecto_id ? dataService.getProyectoById(row.proyecto_id) : null;
  const total = row.cotizacion.estructura_financiera.precio_total_con_iva;
  const amount = project ? (row.grupo?.aplicado ? Number(project.monto_cotizado) - Number(row.grupo.monto_aplicado) + total : kind === 'complementario' ? Number(project.monto_cotizado) + total : null) : total;
  return <ModalOverlay onClose={onClose} aria-label="Elegir presupuesto" className="fixed inset-0 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141A23] p-5 space-y-4">
    <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">Elegir presupuesto</h2><button type="button" aria-label="Cerrar selección" onClick={onClose}><X size={20} /></button></div>
    <p className="font-semibold">{name(row)}</p><p className="text-xl font-bold text-obra-orange">{formatCLP(total)}</p>
    {project ? <p className="text-sm">Se aplicará a <strong>{project.nombre}</strong>. {amount != null ? <>Monto resultante: <strong>{formatCLP(amount)}</strong>.</> : 'Definirá el monto base y conservará los alcances complementarios ya aplicados.'}</p> : <p className="text-sm">Se creará una sola obra con esta alternativa. Las otras opciones quedarán asociadas como historial.</p>}
    {!row.grupo_id && project && <label className="block text-sm space-y-1"><span>Aplicar como</span><select className={input} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="principal">Principal · reemplazar el monto base</option><option value="complementario">Complementario · sumar a la obra</option></select></label>}
    <div className="space-y-2 text-sm"><label className="flex gap-2 items-center"><input type="checkbox" checked={gantt} onChange={(e) => setGantt(e.target.checked)} />{project ? 'Actualizar actividades importadas de este alcance' : 'Incorporar Gantt sugerido'}</label><label className="flex gap-2 items-center"><input type="checkbox" checked={materials} onChange={(e) => setMaterials(e.target.checked)} />{project ? 'Actualizar materiales importados de este alcance' : 'Incorporar materiales cotizados'}</label></div>
    {project && <p className="text-xs text-gray-500">Las opciones desmarcadas conservan los registros existentes. Las compras, avances o ajustes de ejecución deben revisarse antes de sustituir filas importadas. Los pagos recibidos se conservan.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" disabled={busy} className="rounded-xl bg-obra-orange px-4 py-2 text-white font-semibold text-sm" onClick={async () => {
      setBusy(true); setError('');
      try {
        const response = await fetch(row.proyecto_id ? '/api/presupuestos/seleccionar' : '/api/presupuestos/convertir', { method: 'POST', headers: await aiHeaders(), body: JSON.stringify({ id: row.id, updated_at: row.updated_at, incluir_gantt: gantt, incluir_materiales: materials, tipo: kind }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo aplicar el presupuesto.');
        onSaved(body);
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{busy ? 'Guardando…' : row.proyecto_id ? 'Elegir y actualizar obra' : 'Elegir y crear obra'}</button></div>
  </div></ModalOverlay>;
}

export function BudgetGroupCard({ rows, projects, busy, onChoose, onAlternative, onView, onUpdate, onHistory }: { rows: Presupuesto[]; projects: { id: string; nombre: string }[]; busy: boolean; onChoose: (row: Presupuesto) => void; onAlternative: (row: Presupuesto) => void; onView: (row: Presupuesto, edit: boolean) => void; onUpdate: (row: Presupuesto, changes: any) => void; onHistory: (row: Presupuesto) => void }) {
  const group = rows[0].grupo!;
  const chosen = rows.find((r) => r.id === group.seleccionado_id);
  const reference = chosen || rows[0];
  return <section className="min-w-0 rounded-2xl border border-kraft-200 dark:border-gray-700 bg-white dark:bg-[#141A23] p-4 sm:p-5 space-y-4" aria-label={`Alternativas de ${group.nombre}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-lg">{group.nombre}</h3><p className="text-xs text-gray-500">{group.tipo === 'principal' ? 'Presupuesto principal' : 'Alcance complementario'} · {rows.length} {rows.length === 1 ? 'propuesta' : 'alternativas'}</p></div><button type="button" disabled={busy} onClick={() => onAlternative(reference)} className="inline-flex items-center gap-1 text-sm font-semibold text-obra-orange"><Plus size={16} />Crear alternativa</button></div>
    <div className="flex flex-wrap gap-3 items-center"><label className="text-sm flex-1 min-w-0"><span className="sr-only">Obra de {group.nombre}</span><select aria-label={`Obra de ${group.nombre}`} disabled={busy || group.aplicado} value={group.proyecto_id || ''} className={input} onChange={(e) => onUpdate(reference, { proyecto_id: e.target.value || null })}><option value="">Obra por crear</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>{group.proyecto_id && <Link className="text-sm text-obra-green underline" href={`/proyectos/${group.proyecto_id}/presupuestos`}>Ver obra</Link>}</div>
    {group.aplicado && chosen && <p className="rounded-xl bg-obra-green/10 p-3 text-sm"><Check size={16} className="inline mr-2 text-obra-green" /><strong>Aplicada: {name(chosen)}</strong> · {formatCLP(Number(group.monto_aplicado))}</p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{rows.map((row) => {
      const selected = group.aplicado && group.seleccionado_id === row.id;
      const total = row.cotizacion.estructura_financiera.precio_total_con_iva;
      const diff = total - reference.cotizacion.estructura_financiera.precio_total_con_iva;
      return <article key={row.id} className={`min-w-0 rounded-xl border bg-kraft-50/60 dark:bg-[#0B0F14] p-4 space-y-4 ${selected ? 'border-obra-green' : 'border-gray-200 dark:border-gray-700'}`} aria-label={`Opción ${name(row)}`}>
        <div><p className="font-semibold">{name(row)}</p><div className="text-2xl font-bold font-mono"><MoneyAmount value={total} /></div>{row.id !== reference.id && <p className="text-xs text-gray-500">{diff === 0 ? 'Mismo importe' : `${diff > 0 ? '+' : '−'}${formatCLP(Math.abs(diff))}`} respecto de {name(reference)}</p>}</div>
        <details className="min-w-0 text-xs break-words"><summary className="cursor-pointer">Ver alcance y materiales</summary><p className="mt-2 whitespace-pre-line">{row.cotizacion.resumen_ejecutivo}</p><ul className="mt-2 space-y-1">{(row.cotizacion.partidas_venta || []).map((p, i) => <li key={`p${i}`}>{p.nombre}: {formatCLP(p.subtotal)}</li>)}{row.cotizacion.materiales.map((m, i) => <li key={`m${i}`}>{m.nombre} · {m.cantidad} {m.unidad}</li>)}</ul></details>
        <select aria-label={`Estado de ${name(row)}`} className={input} value={row.estado} disabled={busy || selected} onChange={(e) => e.target.value === 'aprobada' ? onChoose(row) : onUpdate(row, { estado: e.target.value })}>{budgetStatuses.map((s) => <option key={s} value={s}>{budgetLabels[s]}</option>)}</select>
        <div className="flex flex-wrap items-center gap-3 text-sm"><button type="button" onClick={() => onHistory(row)} className="text-gray-500">Historial</button><button type="button" onClick={() => onView(row, false)} className="text-obra-orange font-semibold">Ver / PDF</button>{!selected && <button type="button" onClick={() => onView(row, true)} className="font-semibold">Editar</button>}{!selected && !['rechazada','anulada'].includes(row.estado) && <button type="button" disabled={busy} onClick={() => onChoose(row)} className="rounded-lg bg-obra-green text-white px-3 py-2 font-semibold">Elegir y aplicar</button>}{selected && <span className="text-obra-green font-semibold">Elegida para ejecución</span>}</div>
      </article>;
    })}</div>
  </section>;
}

export function BudgetHistoryDialog({ row, onClose }: { row: Presupuesto; onClose: () => void }) {
  const [revisions, setRevisions] = useState<{id: string; version: string; cotizacion: CotizacionEstimacion}[]>([]);
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [preview, setPreview] = useState<CotizacionEstimacion | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/presupuestos?id=' + encodeURIComponent(row.id) + '&historial=1', { headers: await aiHeaders(), cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo cargar el historial.');
        if (active) setRevisions(body.revisiones || []);
      } catch (e) { if (active) setError((e as Error).message); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [row.id]);
  return <><ModalOverlay onClose={onClose} aria-label="Historial del presupuesto" className="fixed inset-0 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"><div className="w-full max-w-lg bg-white dark:bg-[#141A23] rounded-2xl p-5 space-y-4">
    <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">Historial del presupuesto</h2><button type="button" aria-label="Cerrar historial" onClick={onClose}><X size={20} /></button></div>
    <p className="text-sm font-semibold">{name(row)}</p>
    {busy && <p role="status">Cargando revisiones…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
    {!busy && !error && !revisions.length && <p className="text-sm text-gray-500">No hay ediciones anteriores guardadas.</p>}
    {revisions.map((r) => <div key={r.id} className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 text-sm"><div><p>{new Date(r.version).toLocaleString('es-CL')}</p><strong>{formatCLP(r.cotizacion.estructura_financiera.precio_total_con_iva)}</strong></div><button type="button" className="text-obra-orange font-semibold" onClick={() => setPreview(r.cotizacion)}>Ver revisión / PDF</button></div>)}
  </div></ModalOverlay>{preview && <CotizacionPdfModal isOpen onClose={() => setPreview(null)} cotizacion={preview} readOnly />}</>;
}
