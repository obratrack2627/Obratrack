'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FolderPlus, Loader2 } from 'lucide-react';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import type { CotizacionEstimacion } from '@/types/database';
import type { Presupuesto } from '@/lib/presupuestos';

export default function QuoteProjectProposal({ quote, projectId }: { quote: CotizacionEstimacion; projectId?: string | null }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dismissed, setDismissed] = useState(false);
  const [created, setCreated] = useState<{ id: string; nombre: string } | null>(null);
  const [gantt, setGantt] = useState(true), [materials, setMaterials] = useState(true);
  if (!['admin', 'supervisor'].includes(dataService.getActiveUser()?.rol || '') || dismissed) return null;
  if (projectId) return <p className="mt-3 text-xs text-gray-500">Presupuesto asociado a una obra. <Link className="text-obra-orange underline" href={`/proyectos/${projectId}/gantt`}>Abrir Carta Gantt</Link></p>;
  const phases = quote.actividades_gantt.length ? quote.actividades_gantt : [{ nombre: 'Ejecutar alcance presupuestado', dias: quote.duracion_dias_estimada }];
  return <section aria-label="Crear obra desde cotización" className="mt-3 rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-3 text-sm">
    {created ? <><p className="font-semibold">Obra guardada: {created.nombre}</p><Link className="text-obra-orange underline font-semibold" href={`/proyectos/${created.id}/gantt`}>Abrir obra y Carta Gantt</Link></> : <>
      <p className="font-semibold">¿Quieres crear la obra con esta cotización?</p>
      <div className="flex flex-wrap gap-3 text-xs"><label className="flex gap-2 items-center"><input type="checkbox" checked={gantt} onChange={(e) => setGantt(e.target.checked)} disabled={busy} />Usar Gantt sugerido</label><label className="flex gap-2 items-center"><input type="checkbox" checked={materials} onChange={(e) => setMaterials(e.target.checked)} disabled={busy} />Añadir materiales ({quote.materiales.length})</label></div>
      <details className="text-xs"><summary className="cursor-pointer">Revisar Gantt sugerido</summary><ol className="list-decimal ml-5 mt-2 space-y-1">{phases.map((phase, i) => <li key={i}>{phase.nombre} · {phase.dias} día(s)</li>)}</ol><p className="mt-2 text-gray-500">Podrás ajustar las fechas y partidas en la obra.</p></details>
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 bg-obra-orange text-white font-bold text-xs disabled:opacity-60" onClick={async () => {
        if (busy) return; setBusy(true); setError('');
        try {
          const headers = await aiHeaders();
          const load = await fetch('/api/presupuestos?id=' + encodeURIComponent(quote.id), { headers, cache: 'no-store' });
          const loaded = await load.json();
          if (!load.ok) throw new Error(loaded.error || 'No se pudo consultar la cotización guardada.');
          const row: Presupuesto | undefined = loaded.presupuestos.find((r: Presupuesto) => r.id === quote.id || r.cotizacion.id === quote.id);
          if (!row) throw new Error('Actualiza el listado de presupuestos para recuperar esta cotización.');
          const response = await fetch('/api/presupuestos/convertir', { method: 'POST', headers, body: JSON.stringify({ id: row.id, updated_at: row.updated_at, incluir_gantt: gantt, incluir_materiales: materials }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'No se pudo crear la obra. Puedes reintentar.');
          setCreated(result.proyecto);
          const refresh = await dataService.pullFromCloudServer();
          if (!refresh.success) setError('La obra está guardada en la nube. Actualiza la página para cargarla.');
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <FolderPlus size={15} />}{busy ? 'Creando…' : 'Crear obra'}</button><button type="button" className="text-xs text-gray-500 underline" disabled={busy} onClick={() => setDismissed(true)}>Ahora no</button></div>
    </>}
    {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}
  </section>;
}
