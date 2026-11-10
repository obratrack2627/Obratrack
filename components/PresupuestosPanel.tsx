"use client";
import MoneyAmount from './MoneyAmount';
import ActionMenu from './ActionMenu';
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderPlus } from "lucide-react";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import {
  budgetStatuses,
  type Presupuesto,
  type BudgetStatus,
} from "@/lib/presupuestos";
import { formatDate } from "@/lib/utils";
import { canonicalPhone } from "@/lib/phone";
import type { Cliente, Proyecto } from "@/types/database";
import CotizacionPdfModal from "./CotizacionPdfModal";
import { BudgetCreateDialog, BudgetAlternativeDialog, BudgetChoiceDialog, BudgetGroupCard, BudgetHistoryDialog } from './BudgetAlternatives';

const labels: Record<BudgetStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  anulada: "Anulada",
  no_elegida: "No elegida",
};

const normText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function resolveCanonicalClient(
  row: Presupuesto,
  projects: Proyecto[],
  clients: Cliente[],
): Presupuesto {
  if (!clients.length) return row;
  const cot = row.cotizacion;
  let matched: Cliente | undefined;

  if (cot.cliente_id) {
    matched = clients.find((c) => c.id === cot.cliente_id);
  }
  if (!matched && row.proyecto_id) {
    const proj = projects.find((p) => p.id === row.proyecto_id);
    if (proj?.cliente_id) {
      matched = clients.find((c) => c.id === proj.cliente_id);
    }
  }
  if (!matched && cot.cliente_email) {
    const emailNorm = cot.cliente_email.trim().toLowerCase();
    matched = clients.find((c) => c.email?.trim().toLowerCase() === emailNorm);
  }
  if (!matched && cot.cliente_telefono) {
    const phoneNorm = canonicalPhone(cot.cliente_telefono);
    if (phoneNorm) {
      matched = clients.find((c) => canonicalPhone(c.telefono || "") === phoneNorm);
    }
  }
  if (!matched && cot.cliente_nombre) {
    const rawNorm = normText(cot.cliente_nombre);
    matched = clients.find((c) => normText(c.nombre) === rawNorm);
    if (!matched) {
      const firstToken = rawNorm.split(/\s+/)[0] || "";
      if (firstToken.length >= 4) {
        const byFirst = clients.filter(
          (c) => (normText(c.nombre).split(/\s+/)[0] || "") === firstToken,
        );
        if (byFirst.length === 1) matched = byFirst[0];
      }
    }
  }
  if (!matched || matched.nombre === cot.cliente_nombre) return row;
  return {
    ...row,
    cotizacion: {
      ...cot,
      cliente_id: cot.cliente_id || matched.id,
      cliente_nombre: matched.nombre,
    },
  };
}

export default function PresupuestosPanel({
  projectId,
}: {
  projectId?: string;
}) {
  const [rows, setRows] = useState<Presupuesto[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [createdNotice, setCreatedNotice] = useState<{
      id: string;
      nombre: string;
      partidas: number;
      materiales: number;
    } | null>(null);
  const [filter, setFilter] = useState("todos"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Presupuesto | null>(null);
  const [editSelected, setEditSelected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [variantSource, setVariantSource] = useState<Presupuesto | null>(null);
  const [history, setHistory] = useState<Presupuesto | null>(null);
  const [groupFilter, setGroupFilter] = useState('');
  const [choice, setChoice] = useState<Presupuesto | null>(null);
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        "/api/presupuestos" +
          (projectId ? "?proyecto_id=" + encodeURIComponent(projectId) : ""),
        { headers: await aiHeaders() },
      );
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "No se pudo cargar el listado.");
      const loadedProjects = dataService.getProyectos();
      const loadedClients = dataService.getClientes();
      setProjects(loadedProjects);
      setClients(loadedClients);
      setRows(
        (body.presupuestos as Presupuesto[]).map((r) =>
          resolveCanonicalClient(r, loadedProjects, loadedClients),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setGroupFilter(new URLSearchParams(window.location.search).get('grupo_id') || '');
    void refresh();
  }, [projectId]);

  async function update(
    row: Presupuesto,
    changes: { estado?: BudgetStatus; proyecto_id?: string | null },
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/presupuestos", {
        method: "PATCH",
        headers: await aiHeaders(),
        body: JSON.stringify({
          id: row.id,
          updated_at: row.updated_at,
          estado: row.estado,
          ...changes,
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "No se pudo guardar el cambio.");
      if (row.grupo_id) { await refresh(); return body.presupuesto as Presupuesto; }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? body.presupuesto : r)),
      );
      return body.presupuesto as Presupuesto;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleConvertirEnObra(row: Presupuesto) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/presupuestos/convertir", {
        method: "POST", headers: await aiHeaders(),
        body: JSON.stringify({ id: row.id, updated_at: row.updated_at }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "No se pudo convertir el presupuesto.");
      setRows((previous) => previous.map((r) => r.id === row.id ? result.presupuesto : r));
      setProjects((previous) => [...previous.filter((p) => p.id !== result.proyecto.id), result.proyecto]);
      setCreatedNotice({ id: result.proyecto.id, nombre: result.proyecto.nombre, partidas: result.actividadesCreadas, materiales: result.materialesCargados });
      const refreshed = await dataService.pullFromCloudServer();
      if (!refreshed.success) setError("La obra quedó guardada en la nube. Actualiza la página para cargarla en este dispositivo.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const visible = rows.filter(
    (r) =>
      (filter === "todos" || r.estado === filter) && (!groupFilter || r.grupo_id === groupFilter) &&
      `${r.cotizacion.titulo_proyecto} ${r.cotizacion.cliente_nombre || ""} ${r.nombre_alternativa || ''} ${r.cotizacion.nombre_alternativa || ''} ${r.grupo?.nombre || ''}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );

  return (
    <section className="space-y-4" aria-label="Presupuestos de obras">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy-900 dark:text-white">
          Presupuestos
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <ActionMenu label="Crear presupuesto" text="Crear presupuesto">
            <Link href={projectId ? `/proyectos/${projectId}/ia` : '/cotizador'}>Con ObraBot</Link>
            <button type="button" onClick={() => setCreating(true)}>Precio acordado</button>
          </ActionMenu>
          <button
            disabled={busy}
            onClick={refresh}
            className="text-sm underline text-gray-700 dark:text-gray-300"
          >
            {busy ? "Actualizando…" : "Actualizar"}
          </button>

        </div>
      </div>

      {createdNotice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <div className="text-emerald-900 dark:text-emerald-200">
            <p className="font-bold">
              Presupuesto aplicado a {createdNotice.nombre}
            </p>
            <p className="text-xs opacity-90">
              {createdNotice.partidas} actividades y {createdNotice.materiales} materiales incorporados.
            </p>
          </div>
          <Link
            href={`/proyectos/${createdNotice.id}/gantt`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white transition-colors"
          >
            <span>Abrir Obra</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-3 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-3 sm:p-4">
        <input
          aria-label="Buscar presupuesto"
          placeholder="Buscar obra o cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-w-0 max-w-full rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-2.5 text-sm"
        />
        <select
          aria-label="Filtrar por estado"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-2 text-sm"
        >
          <option value="todos">Todos los estados</option>
          {budgetStatuses.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </div>

      {groupFilter && <button type="button" className="text-sm text-obra-orange underline" onClick={() => setGroupFilter('')}>Ver todos los presupuestos</button>}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {!busy && !error && !visible.length && (
        <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-8 text-center text-gray-600 dark:text-gray-400">
          {rows.length
            ? "No hay presupuestos con estos filtros."
            : "Tus cotizaciones de la plataforma y WhatsApp aparecerán aquí."}
        </div>
      )}

      {Array.from(new Set(visible.map((r) => r.grupo_id).filter(Boolean))).map((id) => <BudgetGroupCard key={id} rows={visible.filter((r) => r.grupo_id === id)} projects={projects} busy={busy} onChoose={setChoice} onHistory={setHistory} onAlternative={setVariantSource} onView={(row, edit) => { setSelected(row); setEditSelected(edit); }} onUpdate={(row, changes) => void update(row, changes)} />)}
      {visible.some(row => !row.grupo_id) && (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Listado de presupuestos">
          {visible.filter(row => !row.grupo_id).map(row => {
            const canConvert = !row.proyecto_id && !['anulada','rechazada'].includes(row.estado);
            const tone = row.estado === 'aprobada' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : ['rechazada','anulada'].includes(row.estado) ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' : 'border-kraft-200 bg-kraft-50 text-gray-700 dark:border-[#263040] dark:bg-[#0B0F14] dark:text-gray-200';
            return <article key={row.id} aria-label={`Presupuesto ${row.cotizacion.titulo_proyecto}`} className="min-w-0 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 flex flex-col gap-4">
              <header className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="rounded-md bg-kraft-100 dark:bg-[#1E2530] px-2 py-1">{row.origen === 'whatsapp' ? 'WhatsApp' : 'Plataforma'}</span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
                <h3 className="text-lg font-bold leading-snug text-navy-900 dark:text-white break-words">{row.cotizacion.titulo_proyecto}</h3>
                <p className="text-sm text-gray-500 break-words">{row.cotizacion.cliente_nombre || 'Sin cliente asignado'}</p>
              </header>
              <div className="min-w-0 rounded-xl bg-kraft-50 dark:bg-[#0B0F14] px-4 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Total con IVA</p>
                <div className="text-2xl font-bold font-mono text-navy-900 dark:text-white"><MoneyAmount value={row.cotizacion.estructura_financiera.precio_total_con_iva} /></div>
              </div>
              <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                  Estado
                  <select disabled={busy} aria-label={`Estado de ${row.cotizacion.titulo_proyecto}`} value={row.estado} onChange={e => void update(row,{estado:e.target.value as BudgetStatus})} className={`block w-full min-w-0 max-w-full rounded-xl border px-3 py-2.5 text-sm font-semibold ${tone}`}>
                    {budgetStatuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}
                  </select>
                </label>
                <div className="min-w-0 space-y-1.5">
                  <label className="block min-w-0 space-y-1.5 text-xs font-medium text-gray-500">
                    Obra asociada
                    <select disabled={busy} aria-label={`Obra de ${row.cotizacion.titulo_proyecto}`} value={row.proyecto_id || ''} onChange={e => void update(row,{proyecto_id:e.target.value || null})} className="block w-full min-w-0 max-w-full truncate rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#0B0F14] px-3 py-2.5 text-sm text-navy-900 dark:text-gray-100">
                      <option value="">Sin asociar</option>{projects.map(project => <option key={project.id} value={project.id}>{project.nombre}</option>)}
                    </select>
                  </label>
                  {row.proyecto_id && <Link href={`/proyectos/${row.proyecto_id}/finanzas`} className="inline-flex items-center gap-1 text-xs font-semibold text-obra-green hover:underline">Ver obra <ArrowUpRight size={13} /></Link>}
                </div>
              </div>
              <footer className="mt-auto flex items-center gap-2 border-t border-kraft-200 dark:border-[#263040] pt-4">
                <button type="button" onClick={() => {setEditSelected(false);setSelected(row);}} className="rounded-xl bg-obra-orange px-3.5 py-2 text-sm font-semibold text-white hover:bg-obra-orange-hover">Ver / PDF</button>
                <button type="button" onClick={() => {setEditSelected(true);setSelected(row);}} className="rounded-xl border border-kraft-200 dark:border-[#263040] px-3.5 py-2 text-sm font-semibold">Editar</button>
                <div className="ml-auto"><ActionMenu label={`Más acciones de ${row.cotizacion.titulo_proyecto}`}>
                  <button type="button" onClick={() => setHistory(row)}>Historial</button>
                  <button type="button" disabled={busy} onClick={() => setVariantSource(row)}>Crear alternativa</button>
                  {row.proyecto_id && !['rechazada','anulada'].includes(row.estado) && <button type="button" disabled={busy} onClick={() => setChoice(row)}>Aplicar a la obra</button>}
                  {canConvert && <button type="button" disabled={busy} onClick={() => void handleConvertirEnObra(row)}><FolderPlus size={15} />Convertir en Obra</button>}
                </ActionMenu></div>
              </footer>
            </article>;
          })}
        </div>
      )}

      <CotizacionPdfModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        cotizacion={selected?.cotizacion || null}
        startEditing={editSelected}
        onSaved={(row) => { setSelected(row); setEditSelected(false); setRows((prev) => prev.map((r) => r.id === row.id ? row : r)); }}
      />
      {history && <BudgetHistoryDialog row={history} onClose={() => setHistory(null)} />}
      {creating && <BudgetCreateDialog projectId={projectId} projects={projects} onClose={() => setCreating(false)} onSaved={(row) => { setCreating(false); setSelected(row); setEditSelected(false); void refresh(); }} />}
      {variantSource && <BudgetAlternativeDialog source={variantSource} onClose={() => setVariantSource(null)} onSaved={(row) => { setVariantSource(null); setSelected(row); setEditSelected(true); void refresh(); }} />}
      {choice && <BudgetChoiceDialog row={choice} onClose={() => setChoice(null)} onSaved={(result) => {
        setChoice(null); setCreatedNotice({ id: result.proyecto.id, nombre: result.proyecto.nombre, partidas: result.actividadesCreadas || 0, materiales: result.materialesCargados || 0 });
        void refresh(); void dataService.pullFromCloudServer().then((r) => { if (!r.success) setError('El presupuesto quedó aplicado. Actualiza la página para cargar la obra.'); });
      }} />}
    </section>
  );
}
