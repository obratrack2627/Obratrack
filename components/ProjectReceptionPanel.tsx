"use client";
import { useState, useRef } from "react";
import { dataService } from "@/lib/data-service";
import {
  validateReception,
  type Reception,
  recordedFlow,
} from "@/lib/construction-workflow";
import { chileToday } from "@/lib/work-calendar";
import { formatCLP, formatDate } from "@/lib/utils";
import EvidenceImage from "@/components/EvidenceImage";
import { crewInput, crewPrimary } from "./CrewAttendanceEditor";
import type { Proyecto } from "@/types/database";
const labels = {
  pendiente: "Pendiente de recepción",
  observaciones: "Con observaciones",
  conforme: "Recibida conforme",
};
export function ReceptionSummary({ summary }: { summary: Reception }) {
  return (
    <div className="space-y-3 text-sm">
      <p>
        <strong>{labels[summary.estado]}</strong> · {formatDate(summary.fecha)}
      </p>
      <p>Mandante o representante: {summary.recibido_por}</p>
      {summary.observaciones && (
        <p className="whitespace-pre-wrap break-words">
          {summary.observaciones}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {summary.fotos.map((photo) => (
          <EvidenceImage
            key={photo}
            src={photo}
            alt="Respaldo de recepción"
            className="h-28 w-full rounded-lg object-cover"
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Registrada por {summary.registrado_por || "jefatura"}. Este registro no
        reemplaza la firma del mandante.
      </p>
    </div>
  );
}
export default function ProjectReceptionPanel({
  project,
  onChanged,
}: {
  project: Proyecto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useRef("");
  const [state, setState] = useState<"observaciones" | "conforme">(
      "observaciones",
    ),
    [name, setName] = useState(project.cliente?.nombre || ""),
    [note, setNote] = useState(""),
    [date, setDate] = useState(chileToday()),
    [photos, setPhotos] = useState<string[]>([]);
  const docs = dataService
    .getDocumentosObra(project.id)
    .filter((row) => row.categoria === "acta_recepcion")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const flow = recordedFlow(
    project,
    dataService.getMaterialesProyecto(project.id),
    dataService.getImprevistos(project.id),
    dataService.getPagos(project.id),
  );
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-kraft-200 bg-white p-4 sm:p-6 dark:border-gray-700 dark:bg-[#141A23]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Entrega y recepción</h2>
          <p className="mt-1 text-sm text-gray-500">
            {labels[project.recepcion_estado || "pendiente"]}
          </p>
        </div>
        {project.estado === "terminado" && (
          <button
            type="button"
            className={crewPrimary}
            onClick={() => setOpen(!open)}
          >
            {open ? "Cerrar formulario" : "Registrar recepción"}
          </button>
        )}
      </div>
      {project.estado !== "terminado" && (
        <p className="text-sm text-gray-500">
          Al completar las partidas podrás registrar la recepción del mandante.
        </p>
      )}
      <details className="rounded-xl bg-kraft-50 p-3 text-sm dark:bg-gray-900">
        <summary className="cursor-pointer font-semibold">
          Saldos de la obra
        </summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ["Por cobrar al cliente", flow.clientDue],
            ["Materiales por pagar", flow.unpaidMaterials],
            ["Jornales por pagar", flow.unpaidLabour],
            ["Otros gastos por pagar", flow.unpaidOther],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex min-w-0 flex-wrap justify-between gap-2"
            >
              <dt>{label}</dt>
              <dd className="font-bold">{formatCLP(Number(value))}</dd>
            </div>
          ))}
        </dl>
        {flow.unknown > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {flow.unknown} registros sin estado de pago confirmado. Revisa
            Finanzas y materiales.
          </p>
        )}
      </details>
      {open && (
        <form
          className="space-y-3 border-t border-kraft-200 pt-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const datos = validateReception(
                project,
                dataService.getActividades(project.id),
                {
                  estado: state,
                  fecha: date,
                  recibido_por: name.trim(),
                  observaciones: note,
                  fotos: photos,
                },
              );
              id.current ||= "recepcion-" + crypto.randomUUID();
              await dataService.gestionarObra(project.id, "gestion", {
                operacion: "recepcion",
                id: id.current,
                datos,
              });
              setOpen(false);
              id.current = "";
              onChanged();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "No se pudo registrar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-semibold">
            Resultado
            <select
              disabled={busy}
              className={`${crewInput} mt-1`}
              value={state}
              onChange={(e) => setState(e.target.value as typeof state)}
            >
              <option value="observaciones">Con observaciones</option>
              <option value="conforme">Recibida conforme</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Nombre del mandante o representante
            <input
              className={`${crewInput} mt-1`}
              required
              maxLength={160}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold">
            Fecha de recepción
            <input
              type="date"
              required
              max={chileToday()}
              value={date}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
              className={`${crewInput} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Observaciones
            <textarea
              required={state === "observaciones"}
              maxLength={4000}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              className={`${crewInput} mt-1`}
            />
          </label>
          <label className="block text-sm font-semibold">
            Fotografías de respaldo
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              className="mt-2 block w-full text-sm"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (photos.length + files.length > 10) {
                  setError("Puedes adjuntar hasta diez fotografías.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const uploaded: string[] = [];
                  for (const file of files) {
                    uploaded.push(
                      (
                        await dataService.uploadArchivoObra(
                          file,
                          project.id,
                          "bitacora-fotos",
                        )
                      ).publicUrl,
                    );
                  }
                  setPhotos((current) => [...current, ...uploaded]);
                } catch {
                  setError(
                    "No se pudieron cargar las fotografías. Vuelve a seleccionarlas.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <button
                key={photo}
                type="button"
                disabled={busy}
                className="rounded-lg border px-3 py-1 text-xs"
                onClick={() =>
                  setPhotos((rows) => rows.filter((row) => row !== photo))
                }
              >
                Foto {index + 1} · Quitar
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Queda un acta en Documentos. No registra pagos ni firma por el
            mandante.
          </p>
          <button type="submit" disabled={busy} className={crewPrimary}>
            {busy ? "Guardando…" : "Confirmar recepción registrada"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {docs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Historial de recepciones ({docs.length})
          </summary>
          <div className="mt-3 space-y-4">
            {docs.map(
              (doc) =>
                doc.recepcion_resumen && (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-kraft-200 p-3"
                  >
                    <ReceptionSummary summary={doc.recepcion_resumen} />
                  </div>
                ),
            )}
          </div>
        </details>
      )}
    </section>
  );
}
