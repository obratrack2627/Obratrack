"use client";
import { useState, useRef } from "react";
import { ClipboardCheck, Download, X } from "lucide-react";
import ModalOverlay from "@/components/ModalOverlay";
import { dataService } from "@/lib/data-service";
import { dailySummary, type DailyClose } from "@/lib/daily-close";
import { chileToday } from "@/lib/work-calendar";
import { formatCLP, formatDate } from "@/lib/utils";
import type { Proyecto } from "@/types/database";
import {
  crewInput,
  crewPrimary,
  crewSecondary,
} from "@/components/CrewAttendanceEditor";
export function DailyCloseSummary({ summary }: { summary: DailyClose }) {
  const list = (title: string, rows: string[]) => (
    <div>
      <h4 className="text-sm font-bold">{title}</h4>
      <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
        {rows.length ? (
          rows.map((row, index) => (
            <li key={index} className="break-words">
              {row}
            </li>
          ))
        ) : (
          <li>Sin registros.</li>
        )}
      </ul>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Personas presentes", summary.presentes],
          ["Horas-hombre", summary.horas],
          ["Ingresos", formatCLP(summary.ingresos)],
          ["Gastos del día", formatCLP(summary.gastos)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 rounded-xl bg-kraft-100 p-3 dark:bg-gray-900"
          >
            <p className="text-xs text-gray-500">{label}</p>
            <strong className="mt-1 block break-all">{value}</strong>
          </div>
        ))}
      </div>
      {list(
        "Asistencia confirmada",
        summary.personas.map(
          (row) => `${row.nombre}: ${row.estado} · ${row.horas} h`,
        ),
      )}
      {list(
        "Avances y evidencias",
        summary.avances.map(
          (row) =>
            `${row.titulo}${row.foto_url ? " · Con fotografía" : ""}: ${row.nota}`,
        ),
      )}
      {list(
        "Materiales recibidos",
        summary.recepciones.map(
          (row) => `${row.material}: ${row.cantidad} ${row.unidad}`,
        ),
      )}
      {list("Incidentes y adicionales pendientes", summary.pendientes)}
      {list("Próxima jornada", summary.tareas_manana)}
      {summary.nota && <p className="break-words text-sm">{summary.nota}</p>}
      {summary.confirmado_por && (
        <p className="border-t border-kraft-200 pt-3 text-xs text-gray-500">
          Confirmado por {summary.confirmado_por} · revisión {summary.version}
        </p>
      )}
    </div>
  );
}
export async function downloadDailyClose(summary: DailyClose) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const pdf = new jsPDF();
  pdf.setFontSize(17);
  pdf.text("ObraTrack · Cierre diario", 14, 20);
  pdf.setFontSize(11);
  pdf.text(
    pdf.splitTextToSize(
      `${summary.proyecto_nombre} · ${formatDate(summary.fecha)}`,
      180,
    ),
    14,
    29,
  );
  const rows = [
    ["Responsable", summary.confirmado_por],
    [
      "Presentes / horas",
      `${summary.presentes} personas / ${summary.horas} horas`,
    ],
    [
      "Ingresos / gastos",
      `${formatCLP(summary.ingresos)} / ${formatCLP(summary.gastos)}`,
    ],
    ...summary.personas.map((row) => [
      "Asistencia",
      `${row.nombre}: ${row.estado}, ${row.horas} h`,
    ]),
    ...summary.avances.map((row) => [
      "Avance",
      `${row.titulo}: ${row.nota}${row.foto_url ? " (con evidencia en bitácora)" : ""}`,
    ]),
    ...summary.recepciones.map((row) => [
      "Recepción",
      `${row.material}: ${row.cantidad} ${row.unidad}`,
    ]),
    ...summary.pendientes.map((row) => ["Pendiente", row]),
    ...summary.tareas_manana.map((row) => ["Próxima jornada", row]),
    ["Observación", summary.nota || "—"],
  ];
  autoTable(pdf, {
    startY: 44,
    head: [["Registro", "Detalle"]],
    body: rows,
    styles: { fontSize: 9, overflow: "linebreak" },
    headStyles: { fillColor: [255, 106, 0] },
  });
  pdf.save(`ObraTrack_cierre_${summary.fecha}_r${summary.version}.pdf`);
}
export default function DailyClosePanel({ proyecto }: { proyecto: Proyecto }) {
  const [date, setDate] = useState(chileToday());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<DailyClose | null>(null);
  const id = useRef("");
  const summary =
    saved ||
    dailySummary(
      proyecto,
      date,
      dataService.getUsuarios(),
      dataService.getAsistencias(proyecto.id),
      dataService.getBitacora(proyecto.id),
      dataService.getMaterialesProyecto(proyecto.id),
      dataService.getImprevistos(proyecto.id),
      dataService.getPagos(proyecto.id),
      dataService.getReclamosCambios(proyecto.id),
      dataService.getActividades(proyecto.id),
    );
  const previous = dataService
    .getDocumentosObra(proyecto.id)
    .filter(
      (row) =>
        row.categoria === "cierre_diario" && row.fecha_documento === date,
    );
  return (
    <section className="rounded-2xl border border-kraft-200 bg-white p-5 dark:border-gray-700 dark:bg-[#141A23]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck className="h-5 w-5 text-[#FF6A00]" />
            Cierre de jornada
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Revisa asistencia, avances, entregas y pendientes antes de
            confirmar.
          </p>
        </div>
        <button
          type="button"
          className={crewSecondary}
          onClick={() => {
            setSaved(null);
            setError("");
            setNote("");
            id.current = "cierre-" + crypto.randomUUID();
            setOpen(true);
          }}
        >
          Revisar jornada
        </button>
      </div>
      <label className="mt-4 inline-flex max-w-full items-center gap-2 text-sm">
        Fecha
        <input
          aria-label="Fecha del cierre"
          type="date"
          max={chileToday()}
          value={date}
          onChange={(event) => {
            if (event.target.value) setDate(event.target.value);
          }}
          className="min-w-0 rounded-lg border border-kraft-200 bg-transparent p-2"
        />
      </label>
      {previous.length > 0 && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-300">
          {previous.length}{" "}
          {previous.length === 1
            ? "cierre confirmado"
            : "revisiones confirmadas"}{" "}
          para esta fecha. Disponibles en Documentos.
        </p>
      )}
      {open && (
        <ModalOverlay
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          aria-label="Cierre de jornada"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-2xl space-y-5 rounded-2xl bg-[#FAF8F5] p-5 dark:bg-[#0B0F14]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">
                  Jornada del {formatDate(date)}
                </h2>
                <p className="text-sm text-gray-500">
                  {saved
                    ? "Cierre guardado en Documentos."
                    : "Vista previa; se confirmará con los datos guardados de la obra."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Cerrar jornada"
              >
                <X size={20} />
              </button>
            </div>
            <DailyCloseSummary summary={summary} />
            {!saved && (
              <label className="block text-sm font-semibold">
                Observación de jefatura (opcional)
                <textarea
                  className={`${crewInput} mt-1`}
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={crewSecondary}
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
              {saved ? (
                <button
                  type="button"
                  className={crewPrimary}
                  onClick={() =>
                    void downloadDailyClose(saved).catch(() =>
                      setError("No se pudo descargar el resumen."),
                    )
                  }
                >
                  <Download size={16} />
                  Descargar PDF
                </button>
              ) : (
                <button
                  type="button"
                  className={crewPrimary}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const result = await dataService.gestionarObra(
                        proyecto.id,
                        "cierre",
                        { id: id.current, fecha: date, nota: note },
                      );
                      setSaved(result.documento.cierre_resumen);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "No se pudo confirmar la jornada.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Guardando…" : "Confirmar cierre"}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}
